import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.cache/browsers');

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:41731', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/serve-tests.mjs',
    url: 'http://127.0.0.1:41731/health',
    reuseExistingServer: false,
  },
});
