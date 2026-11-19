import { knownPrismaError } from './prisma-error';

const prismaError = (code: string) =>
  Object.assign(new Error('x'), {
    name: 'PrismaClientKnownRequestError',
    code,
  });

describe('knownPrismaError', () => {
  it('maps actionable Prisma errors to a status and a message in the user language', () => {
    expect(knownPrismaError(prismaError('P2002'), 'uz')).toEqual({
      status: 409,
      message: 'Bunday yozuv allaqachon mavjud',
    });
    expect(knownPrismaError(prismaError('P2028'), 'ru')?.status).toBe(503);
    expect(knownPrismaError(prismaError('P2025'), 'uz')?.status).toBe(404);
  });

  it('leaves other errors to the 500 path', () => {
    expect(knownPrismaError(prismaError('P1001'), 'uz')).toBeNull();
    expect(knownPrismaError(new Error('boom'), 'uz')).toBeNull();
    expect(knownPrismaError(undefined, 'uz')).toBeNull();
  });
});
