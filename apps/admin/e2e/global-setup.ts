import { chromium, type FullConfig } from '@playwright/test';
import { DIRECTOR } from './tests/helpers';

// Un solo login real para toda la corrida: /api/auth/login tiene rate limit
// de 10 intentos / 15 min por IP (apps/api/src/modules/auth/index.js). Loguearse
// en cada test agotaba el límite a mitad de suite. auth.spec.ts sigue probando
// el login real arrancando sin este storageState (ver test.use ahí).
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL as string;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/admin/`);
  await page.locator('#pl-email').fill(DIRECTOR.email);
  await page.locator('#pl-pass').fill(DIRECTOR.password);
  await page.locator('form[data-action="submit-login"] button[type="submit"]').click();
  await page.locator('.padmin-nav-item[data-id="radar"]').waitFor({ state: 'visible' });
  await page.context().storageState({ path: '.auth/user.json' });
  await browser.close();
}
