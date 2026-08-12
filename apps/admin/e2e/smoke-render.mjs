// Smoke del contrato de renderizado del panel. Cubre lo que rompía el Editor de nota:
// #app se repinta entero en cada setState, así que (a) lo escrito tiene que sobrevivir
// al repintado, (b) el auto-dismiss del toast no debe repintar nada, y (c) el foco y el
// caret deben mantenerse. Si algo de esto se revierte, el encargado pierde texto sin
// aviso — y eso no lo detecta ningún test unitario.
//
// A diferencia del resto de e2e/, no necesita API, DB ni sesión real: corre contra
// `npm run dev` (apps/admin) con la API simulada por Playwright, y no toca datos.
//
//   cd apps/admin && npm run dev        # en otra terminal
//   node e2e/smoke-render.mjs
//
// REGLA: nada de import() dinámico de los módulos de src/. Vite versiona las URLs, así
// que importar './store.ts' a mano puede devolver una SEGUNDA instancia del módulo —
// el test acaba midiendo una copia con su propio estado, no la app. Todo se conduce
// desde la UI, que es además lo que el usuario realmente toca.
import { chromium } from 'playwright-core';
import assert from 'node:assert';

const BASE = process.env.CREA_ADMIN_DEV_URL || 'http://localhost:4001/admin/';
const browser = await chromium.launch();
let ok = 0;
const paso = (msg) => console.log(`ok ${++ok} - ${msg}`);

const SESION = { id: 1, name: 'Directora', role: 'director', allowedModules: ['dashboard', 'editor', 'leads', 'aprobacion'] };
const LEAD = { id: 5, name: 'Juan Pérez', email: 'juan@ejemplo.com', company: null, service_interest: null, message: 'Hola', source_page: null, status: 'nuevo', notes: null, created_at: '2026-08-10T10:00:00Z' };
const PIEZA = { id: 42, title: '', body: 'CUERPO GUARDADO EN EL SERVIDOR', section: 'Local', dek: '', slug: '', cover_image_url: '', author_name: '', is_sponsored: false, sponsor_name: '', image_prompt: '', sensibilidad: null, editorial_directive: '' };

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// Sesión simulada. `control` permite a cada caso alterar el comportamiento del backend
// (caducar el token, hacer fallar una mutación) sin tocar el resto.
async function abrirPanel(control = {}, hash = '') {
  // serviceWorkers:'block' — la PWA registra sw.js, y una vez activo las peticiones
  // salen desde el SW y NO pasan por page.route: el mock se ignora y el test pega a la
  // API real (401 → sesión expirada → login, y todo lo demás falla en cascada). Se nota
  // solo contra el build servido por el contenedor, no bajo `vite dev`.
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
  page.contadores = { pieza: 0 };
  await page.addInitScript(() => localStorage.setItem('crea-admin-token', 'tok'));
  await page.route('**/api/**', (route) => {
    const url = route.request().url();
    const metodo = route.request().method();
    if (control.sesionCaducada) return json(route, { error: 'jwt expired' }, 401);
    if (url.includes('/auth/session')) return json(route, SESION);
    if (/\/editorial\/proposals\/\d+$/.test(url) && metodo === 'GET') { page.contadores.pieza++; return json(route, PIEZA); }
    if (url.includes('/commercial/leads') && metodo === 'GET') return json(route, [LEAD]);
    // El picker del editor necesita al menos un borrador para tener fila y botones.
    if (url.includes('/editorial/proposals?status=borrador')) {
      return json(route, [{ ...PIEZA, status: 'borrador', author_id: 1, updated_at: '2026-08-10T10:00:00Z', title: 'Borrador de prueba' }]);
    }
    if (url.includes('/commercial/leads') && metodo !== 'GET') {
      return control.mutacionFalla
        ? json(route, { error: 'No se pudo guardar el lead.' }, 500)
        : json(route, { ...LEAD, status: 'contactado' });
    }
    // Listas del picker con retraso: al resolver disparan setData → repintado que el
    // usuario no pidió. Es el caso real que le borraba el texto al encargado.
    if (control.demorarListas && url.includes('/editorial/proposals?')) {
      return new Promise((r) => setTimeout(() => r(json(route, [])), control.demorarListas));
    }
    return json(route, []);
  });
  await page.goto(BASE + hash, { waitUntil: 'networkidle' });
  page.errores = errores;
  return page;
}

// --- 1. Arranque -------------------------------------------------------------
{
  const page = await abrirPanel();
  await page.waitForSelector('.padmin-shell');
  assert.strictEqual(page.errores.length, 0, 'errores en arranque: ' + page.errores.join(' | '));
  // Sin el nodo #toasts, main.ts lanzaría TypeError al registrar su listener.
  assert.ok(await page.locator('#toasts').count(), 'falta el nodo #toasts');
  assert.ok(await page.locator('main#padmin-main').count(), 'falta el landmark <main>');
  assert.ok(await page.locator('nav.padmin-sidebar').count(), 'falta el landmark <nav>');
  paso('arranca sin errores, con #toasts y landmarks');
  await page.close();
}

// --- 2. Toasts fuera de #app, y el de error no caduca ------------------------
{
  const page = await abrirPanel({ mutacionFalla: true });
  await page.locator('.padmin-nav-item', { hasText: 'Leads' }).click();
  await page.waitForSelector('.padmin-table-row');
  await page.locator('[data-action="mark-lead"][data-status="contactado"]').click();
  await page.waitForSelector('#toasts .padmin-toast-error');

  assert.strictEqual(await page.locator('#app .padmin-toast').count(), 0, 'el toast se pintó dentro de #app');
  paso('el toast de error vive en #toasts, no en #app');

  // Marca el árbol de #app: si algo lo repinta, la marca desaparece.
  await page.locator('.padmin-h1').evaluate((el) => { el.dataset.marca = 'viva'; });
  await page.waitForTimeout(7000); // más que los 6s del antiguo auto-dismiss
  assert.ok(await page.locator('#toasts .padmin-toast-error').count(), 'REGRESIÓN: el toast de error se auto-cerró');
  assert.strictEqual(await page.locator('.padmin-h1[data-marca="viva"]').count(), 1, 'REGRESIÓN: algo repintó #app solo');
  paso('el error persiste hasta cerrarlo y nada repinta #app por su cuenta');

  await page.locator('#toasts .padmin-toast-close').click();
  assert.strictEqual(await page.locator('#toasts .padmin-toast').count(), 0, 'la × no cierra el toast (delegación fuera de #app)');
  paso('la × cierra el toast pese a vivir fuera de #app');
  await page.close();
}

// --- 3. El toast de éxito sí caduca, sin repintar #app -----------------------
{
  const page = await abrirPanel();
  await page.locator('.padmin-nav-item', { hasText: 'Leads' }).click();
  await page.waitForSelector('.padmin-table-row');
  await page.locator('[data-action="convert-lead"]').click();
  await page.waitForSelector('#toasts .padmin-toast-success');
  await page.locator('.padmin-h1').evaluate((el) => { el.dataset.marca = 'viva'; });
  await page.waitForTimeout(4600); // successToastTimer = 4s
  assert.strictEqual(await page.locator('#toasts .padmin-toast').count(), 0, 'el toast de éxito no caducó');
  assert.strictEqual(await page.locator('.padmin-h1[data-marca="viva"]').count(), 1,
    'REGRESIÓN: el auto-dismiss del éxito repintó #app');
  paso('el éxito caduca solo y su cierre NO repinta #app');
  await page.close();
}

// --- 4. Editor: el texto, el foco y el caret sobreviven a un repintado -------
// El repintado NO se provoca con un click (un click movería el foco al botón y el
// test no probaría nada): se deja en vuelo un fetch lento que, al resolver, llama a
// setData y repinta mientras el encargado escribe. Ese es el escenario que borraba
// el trabajo de verdad — nadie pulsa nada, la pantalla se rehace sola.
{
  const page = await abrirPanel({ demorarListas: 2500 }, '#editor/42');
  await page.waitForSelector('#editor-body');

  const TEXTO = 'Tres párrafos de trabajo SIN GUARDAR.';
  await page.fill('#editor-body', TEXTO);
  await page.locator('#editor-title').focus();
  await page.keyboard.type('Titular nuevo');
  await page.locator('#editor-title').evaluate((el) => el.setSelectionRange(7, 7));

  await page.waitForTimeout(2600);  // las listas resuelven y repintan

  assert.strictEqual(await page.inputValue('#editor-body'), TEXTO,
    'REGRESIÓN: el repintado borró lo escrito en el cuerpo');
  assert.strictEqual(await page.inputValue('#editor-title'), 'Titular nuevo',
    'REGRESIÓN: el repintado borró el título');
  paso('lo escrito en el editor sobrevive a un repintado que nadie pidió');

  assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'editor-title',
    'se perdió el foco tras el repintado');
  assert.strictEqual(await page.evaluate(() => document.activeElement.selectionStart), 7,
    'se perdió la posición del cursor tras el repintado');
  paso('el foco y el cursor se mantienen tras el repintado');
  await page.close();
}

// --- 5. Modal accesible: rol, foco, trampa y retorno -------------------------
{
  const page = await abrirPanel({}, '#editor/42');
  await page.waitForSelector('#editor-body');
  await page.locator('[data-action="close-editor"]').click();  // al picker
  await page.waitForSelector('[data-action="preview-piece"]');

  const abridor = page.locator('button[data-action="preview-piece"][data-id="42"]');
  await abridor.focus();
  await abridor.click();

  const dialogo = page.locator('.padmin-overlay [role="dialog"]');
  assert.strictEqual(await dialogo.count(), 1, 'el modal no expone role="dialog"');
  assert.strictEqual(await dialogo.getAttribute('aria-modal'), 'true', 'falta aria-modal');
  assert.ok(
    await page.evaluate(() => document.querySelector('.padmin-overlay').contains(document.activeElement)),
    'al abrir, el foco no entró al modal'
  );
  paso('el modal es role=dialog/aria-modal y recibe el foco al abrir');

  await page.evaluate(() => {
    const items = [...document.querySelector('.padmin-overlay').querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((n) => n.offsetParent !== null);
    items[items.length - 1].focus();
  });
  await page.keyboard.press('Tab');
  assert.ok(
    await page.evaluate(() => document.querySelector('.padmin-overlay').contains(document.activeElement)),
    'REGRESIÓN: Tab se escapó del modal a la pantalla de atrás'
  );
  paso('Tab queda atrapado dentro del modal');

  await page.keyboard.press('Escape');
  assert.strictEqual(await page.locator('.padmin-overlay').count(), 0, 'Escape no cerró el modal');
  // El botón que lo abrió no tiene id: se reencuentra por tag + data-action + data-id.
  assert.deepStrictEqual(
    await page.evaluate(() => {
      const el = document.activeElement;
      return [el?.tagName.toLowerCase(), el?.getAttribute('data-action'), el?.getAttribute('data-id')];
    }),
    ['button', 'preview-piece', '42'],
    'REGRESIÓN: al cerrar, el foco no volvió al botón de origen'
  );
  paso('al cerrar, el foco vuelve al botón de origen');
  await page.close();
}

// --- 6. Skip link ------------------------------------------------------------
{
  const page = await abrirPanel();
  await page.waitForSelector('.padmin-shell');
  await page.keyboard.press('Tab');
  const enfocado = await page.evaluate(() => ({
    cls: document.activeElement?.className,
    visible: document.activeElement?.getBoundingClientRect().left >= 0,
  }));
  assert.ok(enfocado.cls?.includes('padmin-skip-link'), 'el skip link no es el primer tabulable');
  assert.ok(enfocado.visible, 'el skip link no se hace visible al enfocarlo');
  await page.keyboard.press('Enter');
  assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'padmin-main',
    'el skip link no lleva el foco al contenido');
  paso('el skip link es el primer tabulable y lleva el foco a <main>');
  await page.close();
}

// --- 7. ↻ no debe pisar el borrador abierto ----------------------------------
{
  const page = await abrirPanel({}, '#editor/42');
  await page.waitForSelector('#editor-body');
  page.contadores.pieza = 0;
  const TEXTO = 'Tres párrafos de trabajo SIN GUARDAR.';
  await page.fill('#editor-body', TEXTO);

  await page.locator('[data-action="refresh-screen"]').click();
  await page.waitForTimeout(400);

  assert.strictEqual(page.contadores.pieza, 0, 'REGRESIÓN: ↻ volvió a pedir la pieza que se está editando');
  assert.strictEqual(await page.inputValue('#editor-body'), TEXTO, 'REGRESIÓN: ↻ pisó el borrador sin guardar');
  paso('↻ refresca la pantalla sin pisar el borrador abierto');
  await page.close();
}

// --- 8. Sesión caducada mientras se trabaja ----------------------------------
{
  const control = {};
  const page = await abrirPanel(control);
  await page.waitForSelector('.padmin-shell');
  control.sesionCaducada = true;
  await page.locator('.padmin-nav-item', { hasText: 'Leads' }).click();
  await page.waitForSelector('.padmin-login-card');

  assert.strictEqual(await page.evaluate(() => localStorage.getItem('crea-admin-token')), null,
    'el token caducado sigue en localStorage');
  assert.ok(await page.getByText(/sesión expiró/i).count(), 'no se explica por qué se cerró la sesión');
  paso('la sesión caducada devuelve al login, limpia el token y lo explica');
  await page.close();
}

await browser.close();
console.log(`\n${ok}/${ok} pasaron`);
