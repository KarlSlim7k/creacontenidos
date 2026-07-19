import type { Page } from '@playwright/test';

export const DIRECTOR = { email: 'director@crearcontenidos.com', password: 'crea2026' };

/** Solo para auth.spec.ts, que arranca sin storageState (sesión real de login). */
export async function login(page: Page, creds = DIRECTOR) {
  await page.goto('/admin/');
  await page.locator('#pl-email').fill(creds.email);
  await page.locator('#pl-pass').fill(creds.password);
  await page.locator('form[data-action="submit-login"] button[type="submit"]').click();
  await page.locator('.padmin-nav-item[data-id="radar"]').waitFor({ state: 'visible' });
}

/** Radar tests ya arrancan logueados via storageState global; solo navega. */
export async function gotoRadar(page: Page) {
  await page.goto('/admin/');
  await page.locator('.padmin-nav-item[data-id="radar"]').click();
  await page.locator('h1.padmin-h1', { hasText: 'RADAR' }).waitFor({ state: 'visible' });
}
