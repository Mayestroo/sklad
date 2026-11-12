import type { Prisma } from '@prisma/client';

/**
 * Display text of a `{ uz, ru }` name column for a server message: Uzbek,
 * else Russian; a plain string is returned as-is.
 */
export function translatableText(name: Prisma.JsonValue): string {
  if (typeof name === 'string') return name;
  if (name && typeof name === 'object' && !Array.isArray(name)) {
    const { uz, ru } = name;
    if (typeof uz === 'string' && uz) return uz;
    if (typeof ru === 'string' && ru) return ru;
  }
  return '';
}
