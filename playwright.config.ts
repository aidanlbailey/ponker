import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.browser.ts',
  // Local tabs share the worker's rate limit and public tables.
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npm run dev -- --strictPort',
      cwd: root,
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: true,
    },
    {
      command: 'npx wrangler dev --local --ip 0.0.0.0 --port 8787',
      cwd: fileURLToPath(new URL('./worker', import.meta.url)),
      url: 'http://127.0.0.1:8787/tables',
      reuseExistingServer: true,
    },
  ],
})
