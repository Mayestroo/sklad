import { PrismaClient, PermissionAction, UnitOfMeasure, TransactionDirection } from '.prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const connectionString = process.env.DATABASE_URL || 'postgresql://crm_user:crm_password@localhost:5432/crm_dev?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // ─── 1. Currencies ───────────────────────────────────────────────
  const currencies = [
    { code: 'UZS', name: { uz: "O'zbek so'mi", ru: 'Узбекский сум' }, symbol: "so'm", isDefault: true },
    { code: 'USD', name: { uz: 'AQSH dollari', ru: 'Доллар США' }, symbol: '$', isDefault: false },
    { code: 'EUR', name: { uz: 'Yevro', ru: 'Евро' }, symbol: '€', isDefault: false },
    { code: 'RUB', name: { uz: 'Rossiya rubli', ru: 'Российский рубль' }, symbol: '₽', isDefault: false },
  ];

  for (const currency of currencies) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {},
      create: currency as any,
    });
  }
  console.log('  ✅ Currencies seeded');

  // ─── 2. Tax Rates (system-wide) ──────────────────────────────────
  const taxRates = [
    { name: { uz: 'QQS 12%', ru: 'НДС 12%' }, rate: 12.0, code: 'VAT_12', isDefault: true },
    { name: { uz: "QQS yo'q", ru: 'Без НДС' }, rate: 0.0, code: 'NO_TAX', isDefault: false },
  ];

  for (const tax of taxRates) {
    const existing = await prisma.taxRate.findFirst({ where: { code: tax.code, tenantId: null } });
    if (!existing) {
      await prisma.taxRate.create({ data: tax as any });
    }
  }
  console.log('  ✅ Tax rates seeded');

  // ─── 3. System Permissions ───────────────────────────────────────
  const modules = ['dashboard', 'inventory', 'sales', 'accounting', 'analytics', 'billing', 'settings', 'users', 'finance'];
  const actions: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE'];

  const permissionDescriptions: Record<string, Record<string, { uz: string; ru: string }>> = {
    dashboard: {
      VIEW: { uz: 'Bosh sahifani ko\'rish', ru: 'Просмотр главной страницы' },
    },
    inventory: {
      VIEW: { uz: 'Omborni ko\'rish', ru: 'Просмотр склада' },
      CREATE: { uz: 'Ombor hujjatlarini yaratish', ru: 'Создание складских документов' },
      EDIT: { uz: 'Ombor hujjatlarini tahrirlash', ru: 'Редактирование складских документов' },
      DELETE: { uz: 'Ombor hujjatlarini o\'chirish', ru: 'Удаление складских документов' },
    },
    sales: {
      VIEW: { uz: 'Sotuvni ko\'rish', ru: 'Просмотр продаж' },
      CREATE: { uz: 'Sotuv hujjatlarini yaratish', ru: 'Создание документов продажи' },
      EDIT: { uz: 'Sotuv hujjatlarini tahrirlash', ru: 'Редактирование документов продажи' },
      DELETE: { uz: 'Sotuv hujjatlarini o\'chirish', ru: 'Удаление документов продажи' },
    },
    accounting: {
      VIEW: { uz: 'Buxgalteriyani ko\'rish', ru: 'Просмотр бухгалтерии' },
      CREATE: { uz: 'Buxgalteriya yozuvlarini yaratish', ru: 'Создание бухгалтерских записей' },
      EDIT: { uz: 'Buxgalteriya yozuvlarini tahrirlash', ru: 'Редактирование бухгалтерских записей' },
      DELETE: { uz: 'Buxgalteriya yozuvlarini o\'chirish', ru: 'Удаление бухгалтерских записей' },
    },
    analytics: {
      VIEW: { uz: 'Tahlillarni ko\'rish', ru: 'Просмотр аналитики' },
    },
    finance: {
      VIEW: { uz: 'Moliyani ko\'rish', ru: 'Просмотр финансов' },
      CREATE: { uz: 'Moliya operatsiyalarini yaratish', ru: 'Создание финансовых операций' },
      EDIT: { uz: 'Moliya operatsiyalarini tahrirlash', ru: 'Редактирование финансовых операций' },
      DELETE: { uz: 'Moliya operatsiyalarini o\'chirish', ru: 'Удаление финансовых операций' },
    },
    billing: {
      VIEW: { uz: 'Billingni ko\'rish', ru: 'Просмотр биллинга' },
      EDIT: { uz: 'Billing sozlamalarini tahrirlash', ru: 'Редактирование настроек биллинга' },
    },
    settings: {
      VIEW: { uz: 'Sozlamalarni ko\'rish', ru: 'Просмотр настроек' },
      EDIT: { uz: 'Sozlamalarni tahrirlash', ru: 'Редактирование настроек' },
    },
    users: {
      VIEW: { uz: 'Foydalanuvchilarni ko\'rish', ru: 'Просмотр пользователей' },
      CREATE: { uz: 'Foydalanuvchi yaratish', ru: 'Создание пользователей' },
      EDIT: { uz: 'Foydalanuvchini tahrirlash', ru: 'Редактирование пользователей' },
      DELETE: { uz: 'Foydalanuvchini o\'chirish', ru: 'Удаление пользователей' },
    },
  };

  for (const mod of modules) {
    for (const action of actions) {
      const slug = `${mod}:${action.toLowerCase()}`;
      const desc = permissionDescriptions[mod]?.[action];
      if (!desc) continue;

      await prisma.permission.upsert({
        where: { slug },
        update: {},
        create: {
          module: mod,
          action,
          slug,
          description: desc as any,
        },
      });
    }
  }
  console.log('  ✅ Permissions seeded');

  // ─── 4. System Roles ─────────────────────────────────────────────
  const allPermissions = await prisma.permission.findMany();

  const systemRoles = [
    {
      slug: 'super_admin',
      name: { uz: 'Super Admin', ru: 'Супер Администратор' },
      permissions: allPermissions.map((p) => p.id),
    },
    {
      slug: 'company_admin',
      name: { uz: 'Kompaniya Admini', ru: 'Администратор компании' },
      permissions: allPermissions
        .filter((p) => p.module !== 'billing' || p.action === 'VIEW')
        .map((p) => p.id),
    },
    {
      slug: 'accountant',
      name: { uz: 'Buxgalter', ru: 'Бухгалтер' },
      permissions: allPermissions
        .filter((p) =>
          ['accounting', 'dashboard', 'analytics'].includes(p.module) ||
          (p.module === 'inventory' && p.action === 'VIEW') ||
          (p.module === 'sales' && p.action === 'VIEW'),
        )
        .map((p) => p.id),
    },
    {
      slug: 'warehouse_manager',
      name: { uz: 'Ombor menejeri', ru: 'Менеджер склада' },
      permissions: allPermissions
        .filter((p) =>
          p.module === 'inventory' ||
          p.module === 'dashboard' ||
          (p.module === 'sales' && p.action === 'VIEW'),
        )
        .map((p) => p.id),
    },
    {
      slug: 'salesperson',
      name: { uz: 'Sotuvchi', ru: 'Продавец' },
      permissions: allPermissions
        .filter((p) =>
          p.module === 'sales' ||
          p.module === 'dashboard' ||
          (p.module === 'inventory' && p.action === 'VIEW'),
        )
        .map((p) => p.id),
    },
    {
      slug: 'viewer',
      name: { uz: "Faqat ko'rish", ru: 'Только просмотр' },
      permissions: allPermissions
        .filter((p) => p.action === 'VIEW')
        .map((p) => p.id),
    },
  ];

  for (const role of systemRoles) {
    const existing = await prisma.role.findFirst({
      where: { slug: role.slug, tenantId: null },
    });

    let roleRecord;
    if (!existing) {
      roleRecord = await prisma.role.create({
        data: {
          slug: role.slug,
          name: role.name as any,
          isSystemRole: true,
          tenantId: null,
        },
      });
    } else {
      roleRecord = existing;
    }

    for (const permId of role.permissions) {
      const exists = await prisma.rolePermission.findFirst({
        where: { roleId: roleRecord.id, permissionId: permId },
      });
      if (!exists) {
        await prisma.rolePermission.create({
          data: { roleId: roleRecord.id, permissionId: permId },
        });
      }
    }
  }
  console.log('  ✅ System roles seeded');

  // ─── 5. Demo Tenant Company & Admin User ─────────────────────────
  let company = await prisma.company.findUnique({
    where: { slug: 'orient-trading' },
  });

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: { uz: 'Orient Trading MCHJ', ru: 'ООО Orient Trading' },
        slug: 'orient-trading',
        status: 'ACTIVE',
      },
    });
    console.log('  ✅ Demo Company "Orient Trading MCHJ" created');
  }

  const hashedPassword = await bcrypt.hash('Admin123!', 10);
  let adminUser = await prisma.user.findFirst({
    where: { email: 'admin@orient.uz' },
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        tenantId: company.id,
        email: 'admin@orient.uz',
        passwordHash: hashedPassword,
        firstName: 'Alisher',
        lastName: 'Navoiy',
        preferredLanguage: 'uz',
        isActive: true,
      },
    });

    const companyAdminRole = await prisma.role.findFirst({ where: { slug: 'company_admin', tenantId: null } });
    if (companyAdminRole) {
      await prisma.userRole.create({
        data: { userId: adminUser.id, roleId: companyAdminRole.id },
      });
    }
    console.log('  ✅ Demo Admin User "admin@orient.uz" (Parol: Admin123!) created');
  }

  // ─── 6. Demo Branch & Warehouses ─────────────────────────────────
  let mainBranch = await prisma.branch.findFirst({
    where: { tenantId: company.id, isMain: true },
  });

  if (!mainBranch) {
    mainBranch = await prisma.branch.create({
      data: {
        tenantId: company.id,
        name: { uz: 'Toshkent Bosh Filiali', ru: 'Ташкентский Главный Филиал' },
        address: 'Toshkent sh., Yunusobod t., Amir Temur shoh ko\'chasi 108',
        isMain: true,
      },
    });
  }

  let warehouseCentral = await prisma.warehouse.findFirst({
    where: { tenantId: company.id, name: { path: ['uz'], equals: 'Markaziy Omborxona' } },
  });

  if (!warehouseCentral) {
    warehouseCentral = await prisma.warehouse.create({
      data: {
        tenantId: company.id,
        branchId: mainBranch.id,
        name: { uz: 'Markaziy Omborxona', ru: 'Центральный Склад' },
        address: 'Toshkent, Sergeli sanoat zonasi 4-daho',
        phone: '+998 71 200 00 11',
      },
    });
  }

  let warehouseRetail = await prisma.warehouse.findFirst({
    where: { tenantId: company.id, name: { path: ['uz'], equals: 'Chilonzor Do\'kon Ombori' } },
  });

  if (!warehouseRetail) {
    warehouseRetail = await prisma.warehouse.create({
      data: {
        tenantId: company.id,
        branchId: mainBranch.id,
        name: { uz: 'Chilonzor Do\'kon Ombori', ru: 'Магазинный Склад Чиланзар' },
        address: 'Toshkent sh., Chilonzor 9-mavze',
        phone: '+998 71 200 00 22',
      },
    });
  }
  console.log('  ✅ Demo Branch and Warehouses created');

  // ─── 7. Demo Categories & Products ──────────────────────────────
  let categoryBeverages = await prisma.category.findFirst({
    where: { tenantId: company.id, name: { path: ['uz'], equals: 'Salqin Ichimliklar' } },
  });

  if (!categoryBeverages) {
    categoryBeverages = await prisma.category.create({
      data: {
        tenantId: company.id,
        name: { uz: 'Salqin Ichimliklar', ru: 'Прохладительные Напитки' },
      },
    });
  }

  const productsData = [
    {
      sku: 'COCA-15L',
      barcode: '4780001234567',
      name: { uz: 'Coca-Cola 1.5L', ru: 'Кока-Кола 1.5Л' },
      unitOfMeasure: 'piece' as UnitOfMeasure,
      costPrice: 8500,
      salePrice: 12500,
      vatRate: 12,
      minStockAlert: 10,
      stockCount: 150,
    },
    {
      sku: 'PEPSI-15L',
      barcode: '4780001234588',
      name: { uz: 'Pepsi-Cola 1.5L', ru: 'Пепси-Кола 1.5Л' },
      unitOfMeasure: 'piece' as UnitOfMeasure,
      costPrice: 8300,
      salePrice: 12000,
      vatRate: 12,
      minStockAlert: 10,
      stockCount: 200,
    },
    {
      sku: 'NESTLE-05L',
      barcode: '4780001999999',
      name: { uz: 'Nestle Pure Life Suv 0.5L', ru: 'Вода Nestle Pure Life 0.5Л' },
      unitOfMeasure: 'piece' as UnitOfMeasure,
      costPrice: 2000,
      salePrice: 3500,
      vatRate: 12,
      minStockAlert: 50,
      stockCount: 500,
    },
  ];

  for (const prod of productsData) {
    let p = await prisma.product.findFirst({
      where: { tenantId: company.id, sku: prod.sku },
    });

    if (!p) {
      p = await prisma.product.create({
        data: {
          tenantId: company.id,
          categoryId: categoryBeverages.id,
          sku: prod.sku,
          barcode: prod.barcode,
          name: prod.name as any,
          type: 'PRODUCT',
          unitOfMeasure: prod.unitOfMeasure,
          costPrice: prod.costPrice,
          salePrice: prod.salePrice,
          vatRate: prod.vatRate,
          minStockAlert: prod.minStockAlert,
        },
      });

      await prisma.stockLevel.create({
        data: {
          tenantId: company.id,
          productId: p.id,
          warehouseId: warehouseCentral.id,
          quantity: prod.stockCount,
          reservedQuantity: 0,
        },
      });
    }
  }
  console.log('  ✅ Demo Products and Stock Levels created');

  // ─── 8. Demo Counterparties ──────────────────────────────────────
  await prisma.counterparty.upsert({
    where: { id: 'demo-customer-1' },
    update: {},
    create: {
      id: 'demo-customer-1',
      tenantId: company.id,
      name: 'KORZINKA SUPERMARKET MCHJ',
      type: 'CUSTOMER',
      inn: '301234567',
      mfo: '00440',
      bankAccount: '20208000900111222001',
      phone: '+998 71 140 14 14',
      email: 'procurement@korzinka.uz',
      address: 'Toshkent sh., Yakkasaroy t., Qushbegi 12',
    },
  });

  await prisma.counterparty.upsert({
    where: { id: 'demo-customer-2' },
    update: {},
    create: {
      id: 'demo-customer-2',
      tenantId: company.id,
      name: 'MAKRO HYPERMARKET MCHJ',
      type: 'CUSTOMER',
      inn: '302345678',
      mfo: '00394',
      bankAccount: '20208000900333444001',
      phone: '+998 71 200 12 12',
      email: 'purchasing@makro.uz',
      address: 'Toshkent sh., Shayxontohur t., Navoiy 1A',
    },
  });
  console.log('  ✅ Demo Counterparties created');

  // ─── System TransactionTypes ──────────────────────────────────────
  const systemTransactionTypes = [
    // Income types
    { direction: TransactionDirection.INCOME, name: { uz: "Mijozdan to'lov", ru: 'Оплата от клиента' } },
    { direction: TransactionDirection.INCOME, name: { uz: 'Kontragentdan qaytarilgan pul', ru: 'Возврат от контрагента' } },
    { direction: TransactionDirection.INCOME, name: { uz: 'Kredit (qarz olindi)', ru: 'Кредит (получен заём)' } },
    { direction: TransactionDirection.INCOME, name: { uz: "Ta'sischi kiritgan mablag'", ru: 'Взнос учредителя' } },
    { direction: TransactionDirection.INCOME, name: { uz: 'Boshqa kirim', ru: 'Прочий приход' } },
    // Expense types
    { direction: TransactionDirection.EXPENSE, name: { uz: "Tovar uchun to'lov", ru: 'Оплата за товар' } },
    { direction: TransactionDirection.EXPENSE, name: { uz: "Ta'minotchiga to'lov", ru: 'Оплата поставщику' } },
    { direction: TransactionDirection.EXPENSE, name: { uz: 'Soliq', ru: 'Налоги' } },
    { direction: TransactionDirection.EXPENSE, name: { uz: 'Oylik maosh', ru: 'Заработная плата' } },
    { direction: TransactionDirection.EXPENSE, name: { uz: 'Ijara', ru: 'Аренда' } },
    { direction: TransactionDirection.EXPENSE, name: { uz: 'Transport', ru: 'Транспорт' } },
    { direction: TransactionDirection.EXPENSE, name: { uz: 'Reklama', ru: 'Реклама' } },
    { direction: TransactionDirection.EXPENSE, name: { uz: 'Bank xizmati', ru: 'Банковские услуги' } },
    { direction: TransactionDirection.EXPENSE, name: { uz: "Kreditni qaytarish (qarz to'lash)", ru: 'Погашение кредита' } },
    { direction: TransactionDirection.EXPENSE, name: { uz: 'Boshqa chiqim', ru: 'Прочий расход' } },
  ];

  for (const tt of systemTransactionTypes) {
    const existing = await prisma.transactionType.findFirst({
      where: { tenantId: null, isSystem: true, direction: tt.direction, name: { equals: tt.name } },
    });
    if (!existing) {
      await prisma.transactionType.create({ data: { ...tt, isSystem: true } as any });
    }
  }
  console.log('  ✅ System TransactionTypes seeded');

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
