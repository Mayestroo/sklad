import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import type {
  MailMessage,
  MailTransport,
} from '../../common/mail/mail-transport';

/**
 * D3 (owner, option a): sign-up by email confirmation. POST /auth/register
 * answers the same for a free email, a taken email and a taken company
 * address, so it cannot be used to find out who has an account. The
 * difference goes into the email; the tenant is created when the link is
 * confirmed.
 */
describe('AuthService sign-up by email confirmation (D3)', () => {
  const dto = {
    companyName: { uz: 'Yangi MChJ', ru: 'Новое ООО' },
    companySlug: 'yangi',
    defaultLanguage: 'uz' as const,
    adminEmail: 'Owner@Example.com',
    adminPassword: 'secret123',
    adminFirstName: 'Ali',
    adminLastName: 'Valiyev',
    adminPreferredLanguage: 'ru' as const,
  };

  let prisma: any;
  let sent: MailMessage[];
  let mail: MailTransport;
  let audit: { logAction: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    sent = [];
    mail = { send: jest.fn(async (m: MailMessage) => void sent.push(m)) };
    audit = { logAction: jest.fn() };
    prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      role: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'role-admin', slug: 'company_admin' }),
      },
      userRole: { create: jest.fn() },
      branch: { create: jest.fn().mockResolvedValue({ id: 'branch-1' }) },
      warehouse: { create: jest.fn() },
      pendingRegistration: {
        create: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    service = new AuthService(
      prisma,
      new JwtService({ secret: 'access-secret' }),
      new ConfigService({
        JWT_SECRET: 'access-secret',
        JWT_REFRESH_SECRET: 'refresh-secret',
        FRONTEND_URL: 'https://app.example.uz',
      }),
      audit as any,
      mail,
    );
  });

  const tokenFrom = (message: MailMessage) => {
    const match = /register\/confirm\?token=([A-Za-z0-9_-]+)/.exec(
      message.text,
    );
    if (!match) throw new Error(`no confirmation link in: ${message.text}`);
    return match[1];
  };

  describe('register', () => {
    it('stores a pending sign-up, emails a confirmation link and creates no tenant yet', async () => {
      const answer = await service.registerCompany(dto);

      expect(answer).toEqual({ status: 'CONFIRMATION_SENT' });
      expect(prisma.company.create).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();

      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('owner@example.com');
      // In the admin's language, pointing at the frontend.
      expect(sent[0].text).toContain(
        'https://app.example.uz/ru/register/confirm?token=',
      );
      const token = tokenFrom(sent[0]);

      const stored = prisma.pendingRegistration.create.mock.calls[0][0].data;
      expect(stored.email).toBe('owner@example.com');
      expect(stored.companySlug).toBe('yangi');
      // Only a hash of the token and of the password is stored.
      expect(stored.tokenHash).toBe(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(JSON.stringify(stored)).not.toContain(token);
      expect(JSON.stringify(stored)).not.toContain('secret123');
      expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(stored.expiresAt.getTime()).toBeGreaterThan(
        Date.now() + 23 * 3600 * 1000,
      );
      expect(stored.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 24 * 3600 * 1000,
      );
    });

    it('answers a taken email exactly like a free one and tells the account owner by email', async () => {
      const free = await service.registerCompany(dto);
      sent = [];
      prisma.pendingRegistration.create.mockClear();
      prisma.user.findFirst.mockResolvedValue({
        id: 'u1',
        email: 'owner@example.com',
      });

      const taken = await service.registerCompany(dto);

      expect(taken).toEqual(free);
      expect(prisma.pendingRegistration.create).not.toHaveBeenCalled();
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe('owner@example.com');
      expect(sent[0].text).not.toMatch(/token=/);
      expect(sent[0].text).toContain('https://app.example.uz/ru/login');
    });

    it('answers a taken company address like a free one and says so in the email', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: 'c1', slug: 'yangi' });

      const answer = await service.registerCompany(dto);

      expect(answer).toEqual({ status: 'CONFIRMATION_SENT' });
      expect(prisma.pendingRegistration.create).not.toHaveBeenCalled();
      expect(sent).toHaveLength(1);
      expect(sent[0].text).toContain('yangi');
      expect(sent[0].text).toContain('https://app.example.uz/ru/register');
      expect(sent[0].text).not.toMatch(/token=/);
    });

    it('removes expired pending sign-ups', async () => {
      await service.registerCompany(dto);
      expect(prisma.pendingRegistration.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });

  describe('confirm', () => {
    const pendingFor = async () => {
      await service.registerCompany(dto);
      const token = tokenFrom(sent[0]);
      const data = prisma.pendingRegistration.create.mock.calls[0][0].data;
      prisma.pendingRegistration.findUnique.mockImplementation(
        ({ where }: { where: { tokenHash: string } }) =>
          where.tokenHash === data.tokenHash
            ? { id: 'pending-1', ...data }
            : null,
      );
      return { token, data };
    };

    it('creates the company, its admin, branch and warehouse, and signs the admin in', async () => {
      const { token, data } = await pendingFor();
      prisma.company.create.mockResolvedValue({
        id: 'tenant-new',
        name: dto.companyName,
        slug: 'yangi',
        status: 'TRIAL',
        defaultLanguage: 'uz',
      });
      prisma.user.create.mockResolvedValue({
        id: 'user-new',
        email: 'owner@example.com',
        firstName: 'Ali',
        lastName: 'Valiyev',
        preferredLanguage: 'ru',
      });

      const auth = await service.confirmRegistration(token);

      expect(prisma.company.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: 'yangi',
          status: 'TRIAL',
          name: dto.companyName,
        }),
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-new',
          email: 'owner@example.com',
          passwordHash: data.passwordHash,
          firstName: 'Ali',
          preferredLanguage: 'ru',
        }),
      });
      expect(prisma.userRole.create).toHaveBeenCalledWith({
        data: { userId: 'user-new', roleId: 'role-admin' },
      });
      expect(prisma.branch.create).toHaveBeenCalled();
      expect(prisma.warehouse.create).toHaveBeenCalled();
      // Every pending sign-up for this email is used up.
      expect(prisma.pendingRegistration.deleteMany).toHaveBeenLastCalledWith({
        where: { email: 'owner@example.com' },
      });
      expect(auth.tokens.accessToken).toEqual(expect.any(String));
      expect(auth.user.id).toBe('user-new');
      expect(auth.company?.id).toBe('tenant-new');
    });

    it('refuses an unknown or expired link', async () => {
      await expect(service.confirmRegistration('nope')).rejects.toThrow(
        BadRequestException,
      );

      const { token, data } = await pendingFor();
      prisma.pendingRegistration.findUnique.mockResolvedValue({
        id: 'pending-1',
        ...data,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.confirmRegistration(token)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it('refuses when the email or the company address was taken in the meantime', async () => {
      const { token } = await pendingFor();

      prisma.user.findFirst.mockResolvedValue({ id: 'u-other' });
      await expect(service.confirmRegistration(token)).rejects.toThrow(
        ConflictException,
      );

      prisma.user.findFirst.mockResolvedValue(null);
      prisma.company.findUnique.mockResolvedValue({ id: 'c-other' });
      await expect(service.confirmRegistration(token)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.company.create).not.toHaveBeenCalled();
    });
  });
});
