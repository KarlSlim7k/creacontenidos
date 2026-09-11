import { test, expect } from '@playwright/test';
import { gotoRadar } from './helpers';

test.describe('RADAR', () => {
  test.beforeEach(async ({ page }) => {
    await gotoRadar(page);
  });

  test('B. tabs Temas / Competencia / Fuentes are present', async ({ page }) => {
    await expect(page.locator('.padmin-tab', { hasText: 'Temas' })).toBeVisible();
    await expect(page.locator('.padmin-tab', { hasText: 'Competencia' })).toBeVisible();
    await expect(page.locator('.padmin-tab', { hasText: 'Fuentes' })).toBeVisible();
  });

  test('C. Temas lists seed rows with verification filters', async ({ page }) => {
    const rows = page.locator('.padmin-table-row.clickable');
    await expect(rows.first()).toBeVisible();

    // Con riesgo → seed "Aumento de robos..."
    await page.locator('[data-action="set-radar-verification"][data-value="risk"]').click();
    await expect(page.locator('.padmin-table-row', { hasText: 'Aumento de robos' })).toBeVisible();

    // Verificados → seed ciclovía / corte de agua
    await page.locator('[data-action="set-radar-verification"][data-value="verified"]').click();
    await expect(page.locator('.padmin-table-row', { hasText: /ciclovía|corte de agua/i }).first()).toBeVisible();

    await page.locator('[data-action="set-radar-verification"][data-value="Todos"]').click();
    await expect(rows.first()).toBeVisible();
  });

  test('D. calibración block: 7d/30d chips keep stats visible', async ({ page }) => {
    await expect(page.getByText('Calibración')).toBeVisible();
    const chip7 = page.locator('[data-action="set-radar-stats-days"][data-value="7"]');
    const chip30 = page.locator('[data-action="set-radar-stats-days"][data-value="30"]');
    await expect(chip7).toBeVisible();
    await expect(chip30).toBeVisible();

    await chip7.click();
    await expect(page.getByText(/topics$/)).toBeVisible();
    await expect(page.locator('.padmin-h1')).toBeVisible(); // page didn't crash

    await chip30.click();
    await expect(page.getByText(/topics$/)).toBeVisible();
    await expect(page.locator('.padmin-h1')).toBeVisible();
  });

  test('E. ficha de verificación drawer opens and closes', async ({ page }) => {
    await page.locator('[data-action="set-radar-verification"][data-value="verified"]').click();
    await page.locator('.padmin-table-row', { hasText: 'ciclovía' }).first().click();

    const drawer = page.locator('.padmin-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('FICHA DE VERIFICACIÓN')).toBeVisible();
    await expect(drawer.getByText('EVIDENCIA Y FUENTES', { exact: true })).toBeVisible();
    await expect(drawer.getByText('SEÑALES DE RIESGO', { exact: true })).toBeVisible();

    await page.locator('.padmin-drawer-close').click();
    await expect(drawer).toHaveCount(0);
  });

  test('F. risk topic requires "forzar" + cancelable confirm, no proposal generated', async ({ page }) => {
    await page.locator('[data-action="set-radar-verification"][data-value="risk"]').click();
    await page.locator('.padmin-table-row', { hasText: 'Aumento de robos' }).first().click();

    const drawer = page.locator('.padmin-drawer');
    const forceBtn = drawer.locator('[data-action="generate-proposal-from-topic"]');
    await expect(forceBtn).toHaveText(/Forzar propuesta IA/);
    await expect(forceBtn).toHaveAttribute('data-force-risk', '1');

    let dialogSeen = false;
    page.once('dialog', async (dialog) => {
      dialogSeen = true;
      expect(dialog.type()).toBe('confirm');
      await dialog.dismiss(); // Cancelar
    });
    await forceBtn.click();

    await expect.poll(() => dialogSeen).toBe(true);
    // Cancelado: drawer sigue abierto, sin mensaje de éxito, sin llamada a generate-proposal.
    await expect(drawer).toBeVisible();
    await expect(page.getByText('Propuesta creada')).toHaveCount(0);
  });

  // R2-07/R2-08: descartar un tema exige motivo — ya no es un confirm() nativo.
  // No confirma el descarte (no borra fila de seed real): solo prueba que el
  // modal exige motivo y se puede cancelar. El camino feliz (descarte con
  // motivo válido → 204/200 + bitácora) ya está cubierto a nivel API en
  // check-listening.js (H_DISCARD_REASON).
  test('H. discard topic modal requires a reason, cancel leaves nothing deleted', async ({ page }) => {
    const rows = page.locator('.padmin-table-row.clickable');
    const firstRow = rows.first();
    await expect(firstRow).toBeVisible();
    const rowCountBefore = await rows.count();

    await firstRow.locator('[data-action="delete-topic"]').click();

    const modal = page.locator('.padmin-modal', { hasText: 'Descartar tema' });
    await expect(modal).toBeVisible();
    await modal.locator('[data-action="confirm-discard-topics"]').click();
    await expect(page.getByText('Elige un motivo antes de descartar.')).toBeVisible();
    await expect(modal).toBeVisible(); // sin motivo, el modal no se cierra ni descarta nada

    await modal.locator('select#discard-reason-code').selectOption('poca_relevancia');
    await modal.locator('[data-action="close-discard-topics"]').click();
    await expect(modal).toHaveCount(0);
    await expect(rows).toHaveCount(rowCountBefore); // cancelar no borró la fila
  });

  test('G. Fuentes tab lists seed domains with trust badges, toggle reverts', async ({ page }) => {
    await page.locator('.padmin-tab[data-action="set-radar-tab"][data-tab="fuentes"]').click();

    const fbRow = page.locator('.padmin-table-row', { hasText: 'facebook.com' });
    await expect(fbRow).toBeVisible();
    await expect(fbRow.locator('.padmin-badge', { hasText: 'Baja' })).toBeVisible();

    const govRow = page.locator('.padmin-table-row', { hasText: 'perote.gob.mx' });
    await expect(govRow.locator('.padmin-badge', { hasText: 'Alta' })).toBeVisible();

    const toggleBtn = fbRow.locator('[data-action="toggle-radar-source"]');
    const wasActive = (await fbRow.locator('.padmin-badge', { hasText: 'Activa' }).count()) > 0;

    await toggleBtn.click();
    await expect(fbRow.locator('.padmin-badge', { hasText: wasActive ? 'Off' : 'Activa' })).toBeVisible();

    // revertir para no dejar el entorno sucio
    await fbRow.locator('[data-action="toggle-radar-source"]').click();
    await expect(fbRow.locator('.padmin-badge', { hasText: wasActive ? 'Activa' : 'Off' })).toBeVisible();
  });
});
