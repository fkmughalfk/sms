// Runs before any test module is imported (ConfigModule validates env at import time).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://unused'; // PrismaService is replaced by a PGlite client
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123';
