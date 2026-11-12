import type { Prisma } from '@prisma/client';

/**
 * Stores a validated DTO object (e.g. a `{ uz, ru }` name) in a JSON column
 * as-is. DTO classes have no index signature, so TypeScript will not treat them
 * as `InputJsonValue` on its own.
 */
export function asJson(value: object): Prisma.InputJsonValue {
  return value;
}
