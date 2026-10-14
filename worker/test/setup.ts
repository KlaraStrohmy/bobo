import { applyD1Migrations, env } from 'cloudflare:test';

// Setup files run before each test file; storage is isolated per test file.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
