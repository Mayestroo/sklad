import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => {
  const actual = jest.requireActual('bcrypt');
  return { ...actual, compare: jest.fn(actual.compare) };
});

describe('AuthService.login does not reveal accounts', () => {
  const EMAIL = 'someone@example.com';
  let prisma: any;
  let service: AuthService;
  let logged: string[];
  let spies: jest.SpyInstance[];

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(42),
        update: jest.fn(),
      },
    };
    service = new AuthService(
      prisma,
      new JwtService({}),
      new ConfigService({
        JWT_SECRET: 'a',
        JWT_REFRESH_SECRET: 'b',
      }),
      { logAction: jest.fn() } as any,
    );
    logged = [];
    const capture = (...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
    };
    spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(capture),
    );
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: EMAIL,
      isActive: true,
      passwordHash: await bcrypt.hash('right-password', 4),
      company: null,
      userRoles: [],
    });
  });

  afterEach(() => spies.forEach((s) => s.mockRestore()));

  async function failure(email: string, password: string) {
    try {
      await service.login({ email, password });
    } catch (e) {
      return e;
    }
    throw new Error('login unexpectedly succeeded');
  }

  it('unknown email and wrong password fail identically', async () => {
    const wrongPassword = await failure(EMAIL, 'wrong-password');
    prisma.user.findFirst.mockResolvedValue(null);
    const unknownEmail = await failure('nobody@example.com', 'wrong-password');

    expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
    expect(unknownEmail.getResponse()).toEqual(wrongPassword.getResponse());
  });

  it('an unknown email still pays the bcrypt cost (no timing shortcut)', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    const compare = bcrypt.compare as unknown as jest.Mock;
    compare.mockClear();
    await failure('nobody@example.com', 'wrong-password');
    expect(compare).toHaveBeenCalledTimes(1);
    // The dummy hash must be a real cost-10 hash, or compare returns early.
    expect(compare.mock.calls[0][1]).toMatch(/^\$2[aby]\$10\$.{53}$/);
  });

  it('never counts users', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await failure('nobody@example.com', 'wrong-password');
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('logs neither the email nor whether it exists', async () => {
    await failure(EMAIL, 'wrong-password');
    prisma.user.findFirst.mockResolvedValue(null);
    await failure('nobody@example.com', 'wrong-password');

    const all = logged.join('\n');
    expect(all).not.toMatch(/someone@example\.com|nobody@example\.com/);
    expect(all).not.toMatch(/no user found|user_found|total users/i);
  });
});
