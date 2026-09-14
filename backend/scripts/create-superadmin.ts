import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://crm_user:crm_password@localhost:5432/crm_dev?schema=public';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (query: string): Promise<string> =>
  new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('==============================================');
  console.log('  Sklad ERP — Superadmin Provisioning CLI');
  console.log('==============================================');

  const emailInput = await ask('Superadmin Email [superadmin@sklad.uz]: ');
  const email = (emailInput.trim() || 'superadmin@sklad.uz').toLowerCase();

  const firstNameInput = await ask('Ism (First Name) [SaaS]: ');
  const firstName = firstNameInput.trim() || 'SaaS';

  const lastNameInput = await ask('Familiya (Last Name) [Superadmin]: ');
  const lastName = lastNameInput.trim() || 'Superadmin';

  const passwordInput = await ask('Parol (Password) [SuperAdmin123!]: ');
  const password = passwordInput.trim() || 'SuperAdmin123!';

  rl.close();

  // 1. Ensure system role super_admin exists
  let superAdminRole = await prisma.role.findFirst({
    where: { slug: 'super_admin', tenantId: null },
  });

  if (!superAdminRole) {
    superAdminRole = await prisma.role.create({
      data: {
        slug: 'super_admin',
        name: { uz: 'Super Admin', ru: 'Супер Администратор' },
        isSystemRole: true,
        tenantId: null,
      },
    });
    console.log('  [+] Created super_admin system role.');
  }

  // 2. Check if user already exists
  const hashedPassword = await bcrypt.hash(password, 10);
  const existingUser = await prisma.user.findFirst({
    where: { email },
  });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        passwordHash: hashedPassword,
        firstName,
        lastName,
        isActive: true,
        tenantId: null,
      },
    });

    const userRoleExists = await prisma.userRole.findFirst({
      where: { userId: existingUser.id, roleId: superAdminRole.id },
    });
    if (!userRoleExists) {
      await prisma.userRole.create({
        data: { userId: existingUser.id, roleId: superAdminRole.id },
      });
    }

    console.log(`\n  [OK] Superadmin user "${email}" updated successfully!`);
  } else {
    const newUser = await prisma.user.create({
      data: {
        tenantId: null,
        email,
        passwordHash: hashedPassword,
        firstName,
        lastName,
        preferredLanguage: 'uz',
        isActive: true,
      },
    });

    await prisma.userRole.create({
      data: { userId: newUser.id, roleId: superAdminRole.id },
    });

    console.log(`\n  [OK] Superadmin user "${email}" created successfully!`);
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (e) => {
  console.error('  [!] Error provisioning superadmin:', e);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
