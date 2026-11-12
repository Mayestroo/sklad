import { PERMISSIONS } from '../auth/permission-catalog';
import * as bcrypt from 'bcrypt';

export async function autoSeedIfEmpty(prisma: any) {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return;
    }

    console.log(
      '🌱 Database is empty! Auto-seeding initial system data & admin user...',
    );

    // 1. Currencies
    const currencies = [
      {
        code: 'UZS',
        name: { uz: "O'zbek so'mi", ru: 'Узбекский сум' },
        symbol: "so'm",
        isDefault: true,
      },
      {
        code: 'USD',
        name: { uz: 'AQSH dollari', ru: 'Доллар США' },
        symbol: '$',
        isDefault: false,
      },
      {
        code: 'EUR',
        name: { uz: 'Yevro', ru: 'Евро' },
        symbol: '€',
        isDefault: false,
      },
      {
        code: 'RUB',
        name: { uz: 'Rossiya rubli', ru: 'Российский рубль' },
        symbol: '₽',
        isDefault: false,
      },
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
      {
        name: { uz: 'QQS 12%', ru: 'НДС 12%' },
        rate: 12.0,
        code: 'VAT_12',
        isDefault: true,
      },
      {
        name: { uz: "QQS yo'q", ru: 'Без НДС' },
        rate: 0.0,
        code: 'NO_TAX',
        isDefault: false,
      },
    ];

    for (const tax of taxRates) {
      const existing = await prisma.taxRate.findFirst({
        where: { code: tax.code, tenantId: null },
      });
      if (!existing) {
        await prisma.taxRate.create({ data: tax as any });
      }
    }

    // 3. System Permissions
    for (const p of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { slug: p.slug },
        update: {},
        create: {
          module: p.module,
          action: p.action,
          slug: p.slug,
          description: p.description,
        },
      });
    }

    // 4. System Roles
    const allPermissions = await prisma.permission.findMany();
    const systemRoles = [
      {
        slug: 'super_admin',
        name: { uz: 'Super Admin', ru: 'Супер Администратор' },
        permissions: allPermissions.map((p: any) => p.id),
      },
      {
        slug: 'company_admin',
        name: { uz: 'Kompaniya Admini', ru: 'Администратор компании' },
        permissions: allPermissions
          .filter((p: any) => p.module !== 'billing' || p.action === 'VIEW')
          .map((p: any) => p.id),
      },
      {
        slug: 'accountant',
        name: { uz: 'Buxgalter', ru: 'Бухгалтер' },
        permissions: allPermissions
          .filter(
            (p: any) =>
              ['accounting', 'dashboard', 'analytics'].includes(p.module) ||
              (p.module === 'inventory' && p.action === 'VIEW') ||
              (p.module === 'sales' && p.action === 'VIEW'),
          )
          .map((p: any) => p.id),
      },
      {
        slug: 'warehouse_manager',
        name: { uz: 'Ombor menejeri', ru: 'Менеджер склада' },
        permissions: allPermissions
          .filter(
            (p: any) =>
              p.module === 'inventory' ||
              p.module === 'dashboard' ||
              (p.module === 'sales' && p.action === 'VIEW'),
          )
          .map((p: any) => p.id),
      },
      {
        slug: 'salesperson',
        name: { uz: 'Sotuvchi', ru: 'Продавец' },
        permissions: allPermissions
          .filter(
            (p: any) =>
              p.module === 'sales' ||
              p.module === 'dashboard' ||
              (p.module === 'inventory' && p.action === 'VIEW'),
          )
          .map((p: any) => p.id),
      },
      {
        slug: 'cashier',
        name: { uz: 'Kassir', ru: 'Кассир' },
        permissions: allPermissions
          .filter(
            (p: any) =>
              (p.module === 'sales' && ['VIEW', 'CREATE'].includes(p.action)) ||
              (p.module === 'finance' && ['VIEW', 'CREATE'].includes(p.action)) ||
              p.module === 'dashboard',
          )
          .map((p: any) => p.id),
      },
      {
        slug: 'viewer',
        name: { uz: "Faqat ko'rish", ru: 'Только просмотр' },
        permissions: allPermissions
          .filter((p: any) => p.action === 'VIEW')
          .map((p: any) => p.id),
      },
    ];

    for (const role of systemRoles) {
      const existing = await prisma.role.findFirst({
        where: { slug: role.slug, tenantId: null },
      });
      const roleRecord =
        existing ||
        (await prisma.role.create({
          data: {
            slug: role.slug,
            name: role.name as any,
            isSystemRole: true,
            tenantId: null,
          },
        }));
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

    // 5. Demo Company & Admin User
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
      const companyAdminRole = await prisma.role.findFirst({
        where: { slug: 'company_admin', tenantId: null },
      });
      if (companyAdminRole) {
        await prisma.userRole.create({
          data: { userId: adminUser.id, roleId: companyAdminRole.id },
        });
      }
    } else {
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { passwordHash: hashedPassword, isActive: true },
      });
    }

    console.log(
      '✅ Auto-seed completed successfully! Admin: admin@orient.uz / Admin123!',
    );
  } catch (error) {
    console.error('⚠️ Auto-seed failed:', error);
  }
}
