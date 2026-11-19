import { HttpStatus } from '@nestjs/common';

/**
 * Known Prisma errors a user can act on. They used to fall through to a bare
 * 500 "Ichki server xatosi", which told the user nothing (a duplicate number,
 * a record still in use, a busy server). Anything not listed stays a 500.
 */
const KNOWN: Record<string, { status: number; uz: string; ru: string }> = {
  // Unique constraint
  P2002: {
    status: HttpStatus.CONFLICT,
    uz: 'Bunday yozuv allaqachon mavjud',
    ru: 'Такая запись уже существует',
  },
  // Foreign key: the record is used elsewhere / the reference is missing
  P2003: {
    status: HttpStatus.BAD_REQUEST,
    uz: 'Yozuv boshqa hujjatlarda ishlatilgan yoki bog‘liq yozuv topilmadi',
    ru: 'Запись используется в других документах или связанная запись не найдена',
  },
  // Restrict on delete
  P2014: {
    status: HttpStatus.BAD_REQUEST,
    uz: 'Yozuv boshqa hujjatlarga bog‘langan, o‘chirib bo‘lmaydi',
    ru: 'Запись связана с другими документами, удалить нельзя',
  },
  // Record to update/delete not found
  P2025: {
    status: HttpStatus.NOT_FOUND,
    uz: 'Yozuv topilmadi yoki allaqachon o‘zgartirilgan',
    ru: 'Запись не найдена или уже изменена',
  },
  // Interactive transaction expired / could not start
  P2028: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    uz: 'Server band, amal yakunlanmadi. Birozdan so‘ng qayta urinib ko‘ring',
    ru: 'Сервер занят, операция не завершена. Повторите попытку позже',
  },
  // Write conflict / deadlock
  P2034: {
    status: HttpStatus.CONFLICT,
    uz: 'Hujjat bir vaqtda boshqa foydalanuvchi tomonidan o‘zgartirildi. Qayta urinib ko‘ring',
    ru: 'Документ одновременно изменён другим пользователем. Повторите попытку',
  },
};

export function knownPrismaError(
  exception: unknown,
  locale: string,
): { status: number; message: string } | null {
  if (!exception || typeof exception !== 'object') return null;
  const code = (exception as { code?: unknown }).code;
  const name = (exception as { name?: unknown }).name;
  if (typeof code !== 'string' || name !== 'PrismaClientKnownRequestError') {
    return null;
  }
  const known = KNOWN[code];
  if (!known) return null;
  return {
    status: known.status,
    message: locale === 'ru' ? known.ru : known.uz,
  };
}
