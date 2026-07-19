import { defineConfig, devices } from '@playwright/test';

// URL del admin servido por la API Docker (mismo origen, sin líos de CORS/proxy).
// Override con CREA_E2E_BASE_URL si el puerto host cambia (ver docker-compose API_HOST_PORT).
const baseURL = process.env.CREA_E2E_BASE_URL || 'http://127.0.0.1:3010';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // Login real una sola vez en global-setup (rate limit de /api/auth/login).
    // auth.spec.ts arranca sin sesión vía test.use({ storageState: undefined }).
    storageState: '.auth/user.json',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
