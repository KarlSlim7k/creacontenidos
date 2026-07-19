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
