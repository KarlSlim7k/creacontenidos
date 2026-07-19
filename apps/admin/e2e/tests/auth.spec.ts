import { test, expect } from '@playwright/test';
import { login, DIRECTOR } from './helpers';

test.use({ storageState: { cookies: [], origins: [] } }); // arrancar sin sesión

test.describe('A. Login', () => {
  test('director logs in and reaches the panel', async ({ page }) => {
    await login(page, DIRECTOR);
    await expect(page.locator('.padmin-sidebar')).toBeVisible();
    await expect(page.locator('.padmin-nav-item[data-id="radar"]')).toBeVisible();
    await expect(page.locator('.padmin-login-screen')).toHaveCount(0);
  });

  test('wrong password shows login error, stays on login', async ({ page }) => {
    await page.goto('/admin/');
    await page.locator('#pl-email').fill(DIRECTOR.email);
    await page.locator('#pl-pass').fill('wrong-password');
    await page.locator('form[data-action="submit-login"] button[type="submit"]').click();
    await expect(page.locator('.padmin-login-screen')).toBeVisible();
    await expect(page.locator('.padmin-lede')).toBeVisible();
  });
});
