import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

// Cross-engine runs use the Firefox/WebKit binaries kept INSIDE the project (.browsers/, gitignored):
//   PW_ENGINES=all npx playwright test --project=firefox --project=webkit --project=webkit-mobile
if (process.env.PW_ENGINES === 'all' && !process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve(import.meta.dirname, '.browsers');

// Development/test tooling only. Tests serve the sample feed from tests/fixtures (never production data) and a controllable clock.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: true,
  workers: 3,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8750', locale: 'he-IL', timezoneId: 'Asia/Jerusalem', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'py -m http.server 8750', url: 'http://localhost:8750/index.html', reuseExistingServer: true, timeout: 20000, stdout: 'ignore', stderr: 'ignore' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    // cross-engine runs are opt-in:  PW_ENGINES=all npx playwright test   (needs the Playwright firefox/webkit browsers installed)
    ...(process.env.PW_ENGINES === 'all' ? [
      { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
      { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
      { name: 'webkit-mobile', use: { ...devices['iPhone 14'] } }
    ] : [])
  ]
});
