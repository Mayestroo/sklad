import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import type { Company, User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { asJson } from '../../common/utils/json-column';
import { PrismaService } from '../../common/prisma';
import { AuditService } from '../audit/audit.service';
import { RegisterCompanyDto, LoginDto, RefreshTokenDto } from './dto';
import { JwtPayload, AuthResponse } from '../../../../shared/types';

/** bcrypt hash (cost 10) of a random string no one knows; never matches. */
const UNKNOWN_USER_HASH =
  '$2b$10$kK0JChVph55J8KIdDDCEYu70ALxn7Spg0LmvSJ99XUsHwGbYGlGpi';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Atomic Company Sign-Up:
   * Creates Company (14-day trial) + Admin User + Default Main Branch + Default Warehouse
   */
  async registerCompany(dto: RegisterCompanyDto): Promise<AuthResponse> {
    // 1. Check existing company slug
    const existingCompany = await this.prisma.company.findUnique({
      where: { slug: dto.companySlug },
    });
    if (existingCompany) {
      throw new ConflictException('Company with this slug already exists');
    }

    // 2. Check existing admin email (global check)
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.adminEmail },
    });
    if (existingUser) {
      throw new ConflictException(
        'A user with this email address already exists',
      );
    }

    // 3. Find system role "company_admin"
    const companyAdminRole = await this.prisma.role.findFirst({
      where: { slug: 'company_admin', tenantId: null },
    });

    if (!companyAdminRole) {
      throw new BadRequestException(
        'System role company_admin not found. Run database seed first.',
      );
    }

    // 4. Hash admin password
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    // 5. Atomic Prisma Transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create Company
      const company = await tx.company.create({
        data: {
          name: asJson(dto.companyName),
          slug: dto.companySlug,
          defaultLanguage: dto.defaultLanguage || 'uz',
          status: 'TRIAL',
          trialEndsAt,
        },
      });

      // Create Admin User
      const user = await tx.user.create({
        data: {
          tenantId: company.id,
          email: dto.adminEmail,
          passwordHash,
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          preferredLanguage:
            dto.adminPreferredLanguage || dto.defaultLanguage || 'uz',
          isActive: true,
        },
      });

      // Assign Company Admin Role
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: companyAdminRole.id,
        },
      });

      // Create Default Main Branch
      const branch = await tx.branch.create({
        data: {
          tenantId: company.id,
          name: { uz: 'Asosiy filial', ru: 'Главный филиал' },
          isMain: true,
        },
      });

      // Create Default Warehouse
      await tx.warehouse.create({
        data: {
          tenantId: company.id,
          branchId: branch.id,
          name: { uz: 'Asosiy ombor', ru: 'Главный склад' },
        },
      });

      return { company, user };
    });

    // 6. Record Audit Log
    await this.auditService.logAction({
      tenantId: result.company.id,
      userId: result.user.id,
      entityType: 'Company',
      entityId: result.company.id,
      action: 'CREATE',
      newValue: { name: dto.companyName, slug: dto.companySlug },
    });

    // 7. Generate Tokens and Return Response
    return this.buildAuthResponse(
      result.user,
      result.company,
      ['company_admin'],
      ['*'],
    );
  }

  /**
   * User Login with Email & Password
   */
  async login(dto: LoginDto, ipAddress?: string): Promise<AuthResponse> {
    const cleanEmail = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: cleanEmail },
      include: {
        company: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    // Compare against a dummy hash when the email is unknown, so both cases
    // cost one bcrypt round and fail with the same error.
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? UNKNOWN_USER_HASH,
    );
    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Reached only with the correct password, so these reveal nothing to a
    // guesser.
    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    if (user.company && user.company.status === 'BLOCKED') {
      throw new UnauthorizedException(
        'Company account is suspended or blocked',
      );
    }

    // Update last login timestamp
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const roleSlugs = user.userRoles.map((ur) => ur.role.slug);
    const permissionSlugs = new Set<string>();

    user.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        permissionSlugs.add(rp.permission.slug);
      });
    });

    // Audit log login
    const targetTenantId = user.tenantId ?? user.company?.id;
    if (targetTenantId) {
      await this.auditService.logAction({
        tenantId: targetTenantId,
        userId: user.id,
        entityType: 'User',
        entityId: user.id,
        action: 'LOGIN',
        ipAddress,
      });
    }

    return this.buildAuthResponse(
      user,
      user.company,
      roleSlugs,
      Array.from(permissionSlugs),
    );
  }

  /**
   * Refresh Token Flow
   */
  async refreshToken(
    dto: RefreshTokenDto,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const roleSlugs = user.userRoles.map((ur) => ur.role.slug);
      const permissionSlugs = new Set<string>();

      user.userRoles.forEach((ur) => {
        ur.role.rolePermissions.forEach((rp) => {
          permissionSlugs.add(rp.permission.slug);
        });
      });

      const newPayload: JwtPayload = {
        sub: user.id,
        tenantId: user.tenantId,
        email: user.email,
        roles: roleSlugs,
        permissions: Array.from(permissionSlugs),
        locale: user.preferredLanguage,
      };

      const jwtExpiration = this.configService.get<string>(
        'JWT_EXPIRATION',
        '1d',
      );
      const accessToken = this.jwtService.sign(newPayload, {
        expiresIn: jwtExpiration as JwtSignOptions['expiresIn'],
      });

      return {
        accessToken,
        expiresIn: 86400, // 1 day in seconds
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Get Current Authenticated Profile
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const roleSlugs = user.userRoles.map((ur) => ur.role.slug);
    const permissions = new Set<string>();

    user.userRoles.forEach((ur) => {
      ur.role.rolePermissions.forEach((rp) => {
        permissions.add(rp.permission.slug);
      });
    });

    return {
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        preferredLanguage: user.preferredLanguage,
        roles: roleSlugs,
        permissions: Array.from(permissions),
      },
      company: user.company
        ? {
            id: user.company.id,
            name: user.company.name,
            slug: user.company.slug,
            status: user.company.status,
            defaultLanguage: user.company.defaultLanguage,
            trialEndsAt: user.company.trialEndsAt,
          }
        : null,
    };
  }

  private buildAuthResponse(
    user: User,
    company: Company | null,
    roles: string[],
    permissions: string[],
  ): AuthResponse {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: company ? company.id : null,
      email: user.email,
      roles,
      permissions,
      locale: user.preferredLanguage || 'uz',
    };

    const jwtExpiration = this.configService.get<string>(
      'JWT_EXPIRATION',
      '1d',
    );
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: jwtExpiration as JwtSignOptions['expiresIn'],
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });

    return {
      user: {
        id: user.id,
        tenantId: user.tenantId ?? null,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        preferredLanguage: user.preferredLanguage,
        roles,
        permissions,
      },
      company: company
        ? {
            id: company.id,
            name: company.name,
            slug: company.slug,
            status: company.status,
            defaultLanguage: company.defaultLanguage,
          }
        : null,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 86400, // 1 day in seconds
      },
    };
  }
}
