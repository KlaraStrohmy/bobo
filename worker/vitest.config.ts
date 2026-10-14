import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // Fixed values override wrangler.jsonc vars and any local .dev.vars, so tests are hermetic.
          bindings: {
            TEST_MIGRATIONS: migrations,
            AZURE_CLIENT_ID: '00000000-0000-0000-0000-00000000c11e',
            AZURE_TENANT_ID: '00000000-0000-0000-0000-000000007e7',
            VAPID_PUBLIC_KEY: '',
            VAPID_PRIVATE_KEY: '',
            ADMIN_EMAILS: 'admin@strohmy.cz',
            AUTH_DISABLED: 'true',
            PUSH_TOKEN_SECRET: 'test-secret',
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/setup.ts'] },
  };
});
