import { ConfigService } from '@nestjs/config';
import { validateRequiredEnv } from './required-env';
import { JwtStrategy } from '../guards/jwt.strategy';
import { PrismaService } from '../prisma';

const VALID = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
  JWT_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
};

describe('validateRequiredEnv (startup)', () => {
  it('passes the config through when every required variable is set', () => {
    expect(validateRequiredEnv({ ...VALID, OTHER: 'x' })).toMatchObject(VALID);
  });

  it('names every missing variable in one clear error', () => {
    expect(() => validateRequiredEnv({})).toThrow(
      /DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET/,
    );
  });

  it.each(['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'])(
    'treats an empty or blank %s as missing',
    (key) => {
      expect(() => validateRequiredEnv({ ...VALID, [key]: '  ' })).toThrow(
        new RegExp(key),
      );
    },
  );

  it('refuses the same secret for access and refresh tokens', () => {
    expect(() =>
      validateRequiredEnv({ ...VALID, JWT_REFRESH_SECRET: VALID.JWT_SECRET }),
    ).toThrow(/JWT_REFRESH_SECRET must differ from JWT_SECRET/);
  });
});

describe('no hard-coded fallbacks', () => {
  const emptyConfig = new ConfigService({});

  it('JwtStrategy refuses to start without JWT_SECRET', () => {
    expect(() => new JwtStrategy(emptyConfig, {} as PrismaService)).toThrow(
      /JWT_SECRET/,
    );
  });

  it('PrismaService refuses to start without DATABASE_URL', () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => new PrismaService()).toThrow(/DATABASE_URL/);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });
});
