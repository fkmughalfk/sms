import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { directDatabaseUrl } from './src/config/database-url';

// The CLI (migrate, studio) uses the direct, non-pooled URL. At runtime the app
// connects with the pooled DATABASE_URL through the pg driver adapter (src/prisma).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: directDatabaseUrl() ?? '',
  },
});
