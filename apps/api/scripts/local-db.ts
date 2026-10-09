import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

/**
 * Local Postgres for development without Neon or a Postgres install: PGlite (WASM)
 * served over the Postgres wire protocol. Data persists in apps/api/.pglite.
 *
 *   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable"
 */
async function main() {
  const port = Number(process.env.LOCAL_DB_PORT ?? 54322);
  const db = await PGlite.create({ dataDir: './.pglite', extensions: { citext } });
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();
  console.log(
    `Local Postgres (PGlite) on postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
  );

  const stop = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

void main();
