# RADAR E2E (Playwright)

Pruebas E2E del panel admin contra el admin servido por la API Docker
(mismo origen, sin líos de CORS). Ver `docs/ia/radar-verificacion-plan.md` /
`docs/ia/radar-calibracion.md` para el contexto de producto.

## Requisitos

- `docker compose up -d db api` corriendo, con seeds aplicados (migraciones
  034/035 + `003_admin_seed.sql`).
- API respondiendo en `http://127.0.0.1:3010` (o el puerto host que use tu
  compose — detectá con `curl -s http://127.0.0.1:<puerto>/health`).

## Instalar y correr

```bash
cd apps/admin/e2e
npm install
npx playwright install chromium   # si no está cacheado
npx playwright test
```

Si tu API Docker no está en `:3010`:

```bash
CREA_E2E_BASE_URL=http://127.0.0.1:<puerto> npx playwright test
```

Reporte HTML: `npx playwright show-report report`.

## Smoke de renderizado (sin API)

`smoke-render.mjs` es aparte: **no** necesita Docker, DB ni sesión, y corre
contra `vite dev`. Cubre el contrato de renderizado del panel — `#app` se
repinta entero en cada `setState`, así que lo escrito debe estar en el state
antes del repintado, el auto-dismiss del toast no debe repintar nada, y el
foco/caret debe sobrevivir. Si eso se revierte, el Editor de nota pierde texto
sin aviso y ningún test unitario lo nota.

```bash
cd apps/admin && npm run dev     # en otra terminal
node e2e/smoke-render.mjs
```

También corre contra el build servido por el contenedor (valida el bundle de
producción, no solo el dev server):

```bash
docker compose build api && docker compose up -d api
CREA_ADMIN_DEV_URL=http://127.0.0.1:3010/admin/ node e2e/smoke-render.mjs
```

El contexto se abre con `serviceWorkers: 'block'`: con el SW de la PWA activo las
peticiones salen desde él y **no pasan por `page.route`**, así que los mocks se
ignoran y el test pega a la API real. Solo se manifiesta contra el contenedor —
bajo `vite dev` el SW no llega a tomar el control.

La API va simulada con `page.route`, y **todo se conduce desde la UI**: nada de
`import()` dinámico de módulos de `src/`. Vite versiona las URLs de módulo, así
que importar `store.ts` a mano puede devolver una *segunda instancia* con su
propio estado — el test acabaría midiendo una copia en vez de la app, y pasando
o fallando por razones falsas.

## Cómo está armado

- `global-setup.ts` hace **un solo login real** (director) y guarda
  `.auth/user.json` (storageState) para toda la corrida — `/api/auth/login`
  tiene rate limit de 10 intentos/15min por IP
  (`apps/api/src/modules/auth/index.js`), y loguearse en cada test lo agota.
- `tests/auth.spec.ts` es la excepción: arranca sin sesión
  (`test.use({ storageState: { cookies: [], origins: [] } })`) para probar
  el flujo de login real.
- `tests/radar.spec.ts` cubre RADAR (tabs, filtros de verificación,
  calibración 7d/30d, ficha/drawer, gate de riesgo con `confirm` cancelable,
  tab Fuentes con toggle reversible).
- `tests/api.spec.ts` pega directo a la API (sin browser) para el gate 409
  `verification_risk` y las formas de `radar-stats` / `radar-sources`.

No borra ni modifica seed data de forma permanente (el toggle de fuente en
G se revierte al final del test).
