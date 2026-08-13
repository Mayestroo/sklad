import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma';
import { AuditService } from '../audit/audit.service';
import { RegisterCompanyDto, LoginDto, RefreshTokenDto } from './dto';
import { JwtPayload, AuthResponse } from '../../../../shared/types';

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
          name: dto.companyName as any,
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
          name: { uz: 'Asosiy filial', ru: 'Главный филиал' } as any,
          isMain: true,
        },
      });

      // Create Default Warehouse
      await tx.warehouse.create({
        data: {
          tenantId: company.id,
          branchId: branch.id,
          name: { uz: 'Asosiy ombor', ru: 'Главный склад' } as any,
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

    console.log(
      `[LOGIN_ATTEMPT] CleanEmail: "${cleanEmail}" (raw: "${dto.email}")`,
    );

    if (!user) {
      const totalUsers = await this.prisma.user.count();
      console.log(
        `[LOGIN_FAILED] No user found with email: "${cleanEmail}". Total users in DB: ${totalUsers}`,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    console.log(
      `[LOGIN_USER_FOUND] User ID: ${user.id}, email: ${user.email}, isActive: ${user.isActive}`,
    );

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      console.log(
        `[LOGIN_FAILED] Password comparison failed for user: "${cleanEmail}"`,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      console.log(`[LOGIN_FAILED] User account inactive: "${cleanEmail}"`);
      throw new UnauthorizedException('User account is deactivated');
    }

    if (user.company.status === 'BLOCKED') {
      console.log(`[LOGIN_FAILED] Company blocked for user: "${cleanEmail}"`);
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
    await this.auditService.logAction({
      tenantId: user.tenantId,
      userId: user.id,
      entityType: 'User',
      entityId: user.id,
      action: 'LOGIN',
      ipAddress,
    });

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
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get(
          'JWT_REFRESH_SECRET',
          'dev-jwt-refresh-secret-change-me-in-production',
        ),
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
        expiresIn: jwtExpiration as any,
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
      company: {
        id: user.company.id,
        name: user.company.name,
        slug: user.company.slug,
        status: user.company.status,
        defaultLanguage: user.company.defaultLanguage,
        trialEndsAt: user.company.trialEndsAt,
      },
    };
  }

  private buildAuthResponse(
    user: any,
    company: any,
    roles: string[],
    permissions: string[],
  ): AuthResponse {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: company.id,
      email: user.email,
      roles,
      permissions,
      locale: user.preferredLanguage,
    };

    const jwtExpiration = this.configService.get<string>(
      'JWT_EXPIRATION',
      '1d',
    );
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: jwtExpiration as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get(
        'JWT_REFRESH_SECRET',
        'dev-jwt-refresh-secret-change-me-in-production',
      ),
      expiresIn: '7d',
    });

    return {
      user: {
        id: user.id,
        tenantId: company.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        preferredLanguage: user.preferredLanguage,
        roles,
        permissions,
      },
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        status: company.status,
        defaultLanguage: company.defaultLanguage,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 86400, // 1 day in seconds
      },
    };
  }
}
