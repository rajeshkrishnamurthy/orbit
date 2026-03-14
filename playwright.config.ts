import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:18101',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'rm -rf .e2e-data && mkdir -p .e2e-data && ORBIT_DATA_DIR=.e2e-data PORT=18101 go run ./cmd/web',
    url: 'http://127.0.0.1:18101',
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
