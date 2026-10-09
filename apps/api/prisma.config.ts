import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// The CLI (migrate, studio) uses the direct, non-pooled URL. At runtime the app
// connects with the pooled DATABASE_URL through the pg driver adapter (src/prisma).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url:
      process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
});
