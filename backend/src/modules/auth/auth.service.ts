import {
  Inject,
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import type { Company, User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { asJson } from '../../common/utils/json-column';
import { PrismaService } from '../../common/prisma';
import { AuditService } from '../audit/audit.service';
import { RegisterCompanyDto, LoginDto, RefreshTokenDto } from './dto';
import {
  JwtPayload,
  AuthResponse,
  RegistrationPendingResponse,
} from '../../../../shared/types';
import {
  MAIL_TRANSPORT,
  type MailTransport,
} from '../../common/mail/mail-transport';
import {
  accountExistsEmail,
  confirmRegistrationEmail,
  slugTakenEmail,
} from './registration-emails';

/** bcrypt hash (cost 10) of a random string no one knows; never matches. */
const UNKNOWN_USER_HASH =
  '$2b$10$kK0JChVph55J8KIdDDCEYu70ALxn7Spg0LmvSJ99XUsHwGbYGlGpi';

/** How long an emailed sign-up link stays valid. */
const REGISTRATION_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/** Sign-up form fields kept on a pending registration until it is confirmed. */
interface PendingRegistrationData {
  companyName: { uz: string; ru: string };
  defaultLanguage: 'uz' | 'ru';
  adminFirstName: string;
  adminLastName: string;
  adminPreferredLanguage: 'uz' | 'ru';
}

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
  ) {}

  /**
   * Company sign-up, step 1 (D3): store a pending registration and email a
   * one-time confirmation link. The answer is the same whether the email
   * or the company address is free or taken, so this route cannot be used
   * to find out who has an account; the difference goes into the email
   * (to the address's owner). Every path hashes the password, so they cost
   * about the same time.
   */
  async registerCompany(
    dto: RegisterCompanyDto,
  ): Promise<RegistrationPendingResponse> {
    const email = dto.adminEmail.trim().toLowerCase();
    const language = dto.adminPreferredLanguage ?? dto.defaultLanguage ?? 'uz';
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
    const frontendUrl = this.frontendUrl();
    const answer: RegistrationPendingResponse = { status: 'CONFIRMATION_SENT' };

    await this.prisma.pendingRegistration.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (await this.emailTaken(this.prisma, email)) {
      await this.mail.send(accountExistsEmail(email, language, frontendUrl));
      return answer;
    }
    if (await this.slugTaken(this.prisma, dto.companySlug)) {
      await this.mail.send(
        slugTakenEmail(email, language, frontendUrl, dto.companySlug),
      );
      return answer;
    }

    const token = randomBytes(32).toString('base64url');
    const data: PendingRegistrationData = {
      companyName: dto.companyName,
      defaultLanguage: dto.defaultLanguage ?? 'uz',
      adminFirstName: dto.adminFirstName,
      adminLastName: dto.adminLastName,
      adminPreferredLanguage: language,
    };
    await this.prisma.pendingRegistration.create({
      data: {
        email,
        companySlug: dto.companySlug,
        tokenHash: hashToken(token),
        passwordHash,
        data: asJson(data),
        expiresAt: new Date(Date.now() + REGISTRATION_LINK_TTL_MS),
      },
    });
    await this.mail.send(
      confirmRegistrationEmail(email, language, frontendUrl, token),
    );
    return answer;
  }

  /**
   * Company sign-up, step 2 (D3): the emailed link was opened. Creates the
   * company (14-day trial), its admin user, main branch and warehouse in
   * one transaction and signs the admin in. The link works once; every
   * pending sign-up for the same email is used up.
   */
  async confirmRegistration(token: string): Promise<AuthResponse> {
    const pending = await this.prisma.pendingRegistration.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!pending || pending.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        "Tasdiqlash havolasi noto'g'ri yoki muddati o'tgan. Qaytadan ro'yxatdan o'ting. / " +
          'Ссылка подтверждения недействительна или устарела. Зарегистрируйтесь заново.',
      );
    }
    const data = pending.data as unknown as PendingRegistrationData;

    const companyAdminRole = await this.prisma.role.findFirst({
      where: { slug: 'company_admin', tenantId: null },
    });
    if (!companyAdminRole) {
      throw new BadRequestException(
        'System role company_admin not found. Run database seed first.',
      );
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    const result = await this.prisma.$transaction(async (tx) => {
      if (await this.emailTaken(tx, pending.email)) {
        throw new ConflictException(
          'Bu email bilan hisob allaqachon mavjud. Tizimga kiring. / ' +
            'Аккаунт с этим email уже существует. Войдите в систему.',
        );
      }
      if (await this.slugTaken(tx, pending.companySlug)) {
        throw new ConflictException(
          `"${pending.companySlug}" manzili band. Boshqa manzil bilan qaytadan ro'yxatdan o'ting. / ` +
            `Адрес "${pending.companySlug}" занят. Зарегистрируйтесь заново с другим адресом.`,
        );
      }

      const company = await tx.company.create({
        data: {
          name: asJson(data.companyName),
          slug: pending.companySlug,
          defaultLanguage: data.defaultLanguage,
          status: 'TRIAL',
          trialEndsAt,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: company.id,
          email: pending.email,
          passwordHash: pending.passwordHash,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          preferredLanguage: data.adminPreferredLanguage,
          isActive: true,
        },
      });

      await tx.userRole.create({
        data: { userId: user.id, roleId: companyAdminRole.id },
      });

      const branch = await tx.branch.create({
        data: {
          tenantId: company.id,
          name: { uz: 'Asosiy filial', ru: 'Главный филиал' },
          isMain: true,
        },
      });

      await tx.warehouse.create({
        data: {
          tenantId: company.id,
          branchId: branch.id,
          name: { uz: 'Asosiy ombor', ru: 'Главный склад' },
        },
      });

      await tx.pendingRegistration.deleteMany({
        where: { email: pending.email },
      });

      return { company, user };
    });

    await this.auditService.logAction({
      tenantId: result.company.id,
      userId: result.user.id,
      entityType: 'Company',
      entityId: result.company.id,
      action: 'CREATE',
      newValue: { name: data.companyName, slug: pending.companySlug },
    });

    return this.buildAuthResponse(
      result.user,
      result.company,
      ['company_admin'],
      ['*'],
    );
  }

  /** Emails are unique across tenants, compared without case. */
  private async emailTaken(
    db: Pick<PrismaService, 'user'>,
    email: string,
  ): Promise<boolean> {
    const user = await db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    return Boolean(user);
  }

  private async slugTaken(
    db: Pick<PrismaService, 'company'>,
    slug: string,
  ): Promise<boolean> {
    const company = await db.company.findUnique({
      where: { slug },
      select: { id: true },
    });
    return Boolean(company);
  }

  /** Base URL of the web app, for links in emails (also the CORS origin). */
  private frontendUrl(): string {
    return this.configService
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
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
