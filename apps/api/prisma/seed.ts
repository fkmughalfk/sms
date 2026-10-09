import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { emailSchema, passwordSchema } from '@sms/shared';
import * as argon2 from 'argon2';
import { directDatabaseUrl } from '../src/config/database-url';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Idempotent seed (spec §13 phase 2): settings row, categories, first SUPER_ADMIN.
 * Safe to re-run — never overwrites an existing user's password.
 */
async function main() {
  const connectionString = directDatabaseUrl();
  if (!connectionString) throw new Error('Set DATABASE_URL (or DIRECT_URL) before seeding.');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    await prisma.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

    for (const name of ['Rice', 'Pulses', 'Other']) {
      await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    }

    const email = emailSchema.parse(process.env.SEED_SUPERADMIN_EMAIL);
    const password = passwordSchema.parse(process.env.SEED_SUPERADMIN_PASSWORD);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`SUPER_ADMIN ${email} already exists — left unchanged.`);
    } else {
      await prisma.user.create({
        data: {
          name: 'Super Admin',
          email,
          role: 'SUPER_ADMIN',
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        },
      });
      console.log(`Created SUPER_ADMIN ${email}. Change the password after first login.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
