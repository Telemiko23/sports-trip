import { defineConfig, devices } from '@playwright/test';

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
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } }
  ]
});
