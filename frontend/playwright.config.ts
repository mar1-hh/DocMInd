import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  globalTimeout: 180_000,
  globalSetup: './tests/e2e/globalSetup.ts',
  reporter: './tests/e2e/safeReporter.ts',
  quiet: true,
  outputDir: './test-results',
  use: {
    // Intentionally fixed: never point this suite at the development server.
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
