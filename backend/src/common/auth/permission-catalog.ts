import type { PermissionAction } from '@prisma/client';

/**
 * The single list of permissions that exist. Seeders create exactly these
 * `<module>:<action>` slugs, and every @RequirePermissions() must use one of
 * them (enforced by permission-catalog.spec.ts). Document lifecycle changes
 * such as post / unpost / cancel use `<module>:edit`.
 */
export const PERMISSION_DESCRIPTIONS: Readonly<
  Record<string, Partial<Record<PermissionAction, { uz: string; ru: string }>>>
> = {
  dashboard: {
    VIEW: { uz: "Bosh sahifani ko'rish", ru: 'Просмотр главной страницы' },
  },
  inventory: {
    VIEW: { uz: "Omborni ko'rish", ru: 'Просмотр склада' },
    CREATE: {
      uz: 'Ombor hujjatlarini yaratish',
      ru: 'Создание складских документов',
    },
    EDIT: {
      uz: 'Ombor hujjatlarini tahrirlash',
      ru: 'Редактирование складских документов',
    },
    DELETE: {
      uz: "Ombor hujjatlarini o'chirish",
      ru: 'Удаление складских документов',
    },
  },
  sales: {
    VIEW: { uz: "Sotuvni ko'rish", ru: 'Просмотр продаж' },
    CREATE: {
      uz: 'Sotuv hujjatlarini yaratish',
      ru: 'Создание документов продажи',
    },
    EDIT: {
      uz: 'Sotuv hujjatlarini tahrirlash',
      ru: 'Редактирование документов продажи',
    },
    DELETE: {
      uz: "Sotuv hujjatlarini o'chirish",
      ru: 'Удаление документов продажи',
    },
  },
  accounting: {
    VIEW: { uz: "Buxgalteriyani ko'rish", ru: 'Просмотр бухгалтерии' },
    CREATE: {
      uz: 'Buxgalteriya yozuvlarini yaratish',
      ru: 'Создание бухгалтерских записей',
    },
    EDIT: {
      uz: 'Buxgalteriya yozuvlarini tahrirlash',
      ru: 'Редактирование бухгалтерских записей',
    },
    DELETE: {
      uz: "Buxgalteriya yozuvlarini o'chirish",
      ru: 'Удаление бухгалтерских записей',
    },
  },
  analytics: {
    VIEW: { uz: "Tahlillarni ko'rish", ru: 'Просмотр аналитики' },
  },
  finance: {
    VIEW: { uz: "Moliyani ko'rish", ru: 'Просмотр финансов' },
    CREATE: {
      uz: 'Moliya operatsiyalarini yaratish',
      ru: 'Создание финансовых операций',
    },
    EDIT: {
      uz: 'Moliya operatsiyalarini tahrirlash',
      ru: 'Редактирование финансовых операций',
    },
    DELETE: {
      uz: "Moliya operatsiyalarini o'chirish",
      ru: 'Удаление финансовых операций',
    },
  },
  billing: {
    VIEW: { uz: "Billingni ko'rish", ru: 'Просмотр биллинга' },
    EDIT: {
      uz: 'Billing sozlamalarini tahrirlash',
      ru: 'Редактирование настроек биллинга',
    },
  },
  settings: {
    VIEW: { uz: "Sozlamalarni ko'rish", ru: 'Просмотр настроек' },
    EDIT: { uz: 'Sozlamalarni tahrirlash', ru: 'Редактирование настроек' },
  },
  users: {
    VIEW: {
      uz: "Foydalanuvchilarni ko'rish",
      ru: 'Просмотр пользователей',
    },
    CREATE: { uz: 'Foydalanuvchi yaratish', ru: 'Создание пользователей' },
    EDIT: {
      uz: 'Foydalanuvchini tahrirlash',
      ru: 'Редактирование пользователей',
    },
    DELETE: {
      uz: "Foydalanuvchini o'chirish",
      ru: 'Удаление пользователей',
    },
  },
};

export interface PermissionDefinition {
  module: string;
  action: PermissionAction;
  slug: string;
  description: { uz: string; ru: string };
}

export const PERMISSIONS: readonly PermissionDefinition[] = Object.entries(
  PERMISSION_DESCRIPTIONS,
).flatMap(([module, actions]) =>
  (
    Object.entries(actions) as [PermissionAction, { uz: string; ru: string }][]
  ).map(([action, description]) => ({
    module,
    action,
    slug: `${module}:${action.toLowerCase()}`,
    description,
  })),
);

export const ALL_PERMISSION_SLUGS: ReadonlySet<string> = new Set(
  PERMISSIONS.map((p) => p.slug),
);
