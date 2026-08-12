import { PermissionAction } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function autoSeedIfEmpty(prisma: any) {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return;
    }

    console.log('🌱 Database is empty! Auto-seeding initial system data & admin user...');

    // 1. Currencies
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

    // 2. Tax Rates
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

    // 3. System Permissions
    const modules = ['dashboard', 'inventory', 'sales', 'accounting', 'analytics', 'billing', 'settings', 'users', 'finance'];
    const actions: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE'];

    const permissionDescriptions: Record<string, Record<string, { uz: string; ru: string }>> = {
      dashboard: { VIEW: { uz: "Bosh sahifani ko'rish", ru: 'Просмотр главной страницы' } },
      inventory: {
        VIEW: { uz: "Omborni ko'rish", ru: 'Просмотр склада' },
        CREATE: { uz: 'Ombor hujjatlarini yaratish', ru: 'Создание складских документов' },
        EDIT: { uz: 'Ombor hujjatlarini tahrirlash', ru: 'Редактирование складских документов' },
        DELETE: { uz: "Ombor hujjatlarini o'chirish", ru: 'Удаление складских документов' },
      },
      sales: {
        VIEW: { uz: "Sotuvni ko'rish", ru: 'Просмотр продаж' },
        CREATE: { uz: 'Sotuv hujjatlarini yaratish', ru: 'Создание документов продажи' },
        EDIT: { uz: 'Sotuv hujjatlarini tahrirlash', ru: 'Редактирование документов продажи' },
        DELETE: { uz: "Sotuv hujjatlarini o'chirish", ru: 'Удаление документов продажи' },
      },
      accounting: {
        VIEW: { uz: "Buxgalteriyani ko'rish", ru: 'Просмотр бухгалтерии' },
        CREATE: { uz: 'Buxgalteriya yozuvlarini yaratish', ru: 'Создание бухгалтерских записей' },
        EDIT: { uz: 'Buxgalteriya yozuvlarini tahrirlash', ru: 'Редактирование бухгалтерских записей' },
        DELETE: { uz: "Buxgalteriya yozuvlarini o'chirish", ru: 'Удаление бухгалтерских записей' },
      },
      analytics: { VIEW: { uz: "Tahlillarni ko'rish", ru: 'Просмотр аналитики' } },
      finance: {
        VIEW: { uz: "Moliyani ko'rish", ru: 'Просмотр финансов' },
        CREATE: { uz: 'Moliya operatsiyalarini yaratish', ru: 'Создание финансовых операций' },
        EDIT: { uz: 'Moliya operatsiyalarini tahrirlash', ru: 'Редактирование финансовых операций' },
        DELETE: { uz: "Moliya operatsiyalarini o'chirish", ru: 'Удаление финансовых операций' },
      },
      billing: {
        VIEW: { uz: "Billingni ko'rish", ru: 'Просмотр биллинга' },
        EDIT: { uz: 'Billing sozlamalarini tahrirlash', ru: 'Редактирование настроек биллинга' },
      },
      settings: {
        VIEW: { uz: "Sozlamalarni ko'rish", ru: 'Просмотр настроек' },
        EDIT: { uz: 'Sozlamalarni tahrirlash', ru: 'Редактирование настроек' },
      },
      users: {
        VIEW: { uz: "Foydalanuvchilarni ko'rish", ru: 'Просмотр пользователей' },
        CREATE: { uz: 'Foydalanuvchi yaratish', ru: 'Создание пользователей' },
        EDIT: { uz: 'Foydalanuvchini tahrirlash', ru: 'Редактирование пользователей' },
        DELETE: { uz: "Foydalanuvchini o'chirish", ru: 'Удаление пользователей' },
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
          create: { module: mod, action, slug, description: desc as any },
        });
      }
    }

    // 4. System Roles
    const allPermissions = await prisma.permission.findMany();
    const systemRoles = [
      { slug: 'super_admin', name: { uz: 'Super Admin', ru: 'Супер Администратор' }, permissions: allPermissions.map((p: any) => p.id) },
      { slug: 'company_admin', name: { uz: 'Kompaniya Admini', ru: 'Администратор компании' }, permissions: allPermissions.filter((p: any) => p.module !== 'billing' || p.action === 'VIEW').map((p: any) => p.id) },
      { slug: 'accountant', name: { uz: 'Buxgalter', ru: 'Бухгалтер' }, permissions: allPermissions.filter((p: any) => ['accounting', 'dashboard', 'analytics'].includes(p.module) || (p.module === 'inventory' && p.action === 'VIEW') || (p.module === 'sales' && p.action === 'VIEW')).map((p: any) => p.id) },
      { slug: 'warehouse_manager', name: { uz: 'Ombor menejeri', ru: 'Менеджер склада' }, permissions: allPermissions.filter((p: any) => p.module === 'inventory' || p.module === 'dashboard' || (p.module === 'sales' && p.action === 'VIEW')).map((p: any) => p.id) },
      { slug: 'salesperson', name: { uz: 'Sotuvchi', ru: 'Продавец' }, permissions: allPermissions.filter((p: any) => p.module === 'sales' || p.module === 'dashboard' || (p.module === 'inventory' && p.action === 'VIEW')).map((p: any) => p.id) },
      { slug: 'viewer', name: { uz: "Faqat ko'rish", ru: 'Только просмотр' }, permissions: allPermissions.filter((p: any) => p.action === 'VIEW').map((p: any) => p.id) },
    ];

    for (const role of systemRoles) {
      const existing = await prisma.role.findFirst({ where: { slug: role.slug, tenantId: null } });
      let roleRecord = existing || (await prisma.role.create({ data: { slug: role.slug, name: role.name as any, isSystemRole: true, tenantId: null } }));
      for (const permId of role.permissions) {
        const exists = await prisma.rolePermission.findFirst({ where: { roleId: roleRecord.id, permissionId: permId } });
        if (!exists) {
          await prisma.rolePermission.create({ data: { roleId: roleRecord.id, permissionId: permId } });
        }
      }
    }

    // 5. Demo Company & Admin User
    let company = await prisma.company.findUnique({ where: { slug: 'orient-trading' } });
    if (!company) {
      company = await prisma.company.create({
        data: { name: { uz: 'Orient Trading MCHJ', ru: 'ООО Orient Trading' }, slug: 'orient-trading', status: 'ACTIVE' },
      });
    }

    const hashedPassword = await bcrypt.hash('Admin123!', 10);
    let adminUser = await prisma.user.findFirst({ where: { email: 'admin@orient.uz' } });
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: { tenantId: company.id, email: 'admin@orient.uz', passwordHash: hashedPassword, firstName: 'Alisher', lastName: 'Navoiy', preferredLanguage: 'uz', isActive: true },
      });
      const companyAdminRole = await prisma.role.findFirst({ where: { slug: 'company_admin', tenantId: null } });
      if (companyAdminRole) {
        await prisma.userRole.create({ data: { userId: adminUser.id, roleId: companyAdminRole.id } });
      }
    } else {
      await prisma.user.update({ where: { id: adminUser.id }, data: { passwordHash: hashedPassword, isActive: true } });
    }

    console.log('✅ Auto-seed completed successfully! Admin: admin@orient.uz / Admin123!');
  } catch (error) {
    console.error('⚠️ Auto-seed failed:', error);
  }
}
