import { defineConfig } from '@playwright/test';

/**
 * Test end-to-end sulla build di produzione (service worker attivo).
 * Usa il Chrome installato nel sistema: nessun download di browser necessario.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    channel: 'chrome',
    viewport: { width: 412, height: 915 },
    hasTouch: true,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    serviceWorkers: 'allow',
  },
  webServer: {
    command: 'npx vite preview --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
