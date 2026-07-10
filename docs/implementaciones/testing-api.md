# Testing de apps/api

## Qué tipo de pruebas hay

Scripts ejecutables en `apps/api/scripts/`, sin framework (Node CommonJS +
`node:assert` + `fetch` nativo). Cada uno levanta `src/server.js` como
proceso hijo, ejecuta asserts contra la API real y limpia sus datos en
`finally`. Requieren Postgres real vía `DATABASE_URL`.

Grupos (ver `apps/api/scripts/run-checks.js`):

- **unit** — `check-nota-ssr.js`: puro, sin servidor ni DB.
- **public** — `check-public-api.js`, `check-leads.js`: endpoints públicos.
- **integration** — `check-newsletter.js`, `check-content-engine.js`,
  `check-social.js`, `check-competitor-scraper.js`: módulos con guards de
  auth/rol/validación (evitan gastar en APIs de pago).
- **e2e** — `verify-e2e.js`, `check-admin-api.js`: flujos completos
  multi-rol (panel admin, portada→nota→contacto).

## Cómo correr

```bash
cd apps/api
npm test              # solo unit, rápido
npm run test:public
npm run test:integration
npm run test:e2e
npm run test:all      # todo, en orden, fail-fast
npm run check         # alias de test:all
```

Grupo directo o listado de checks:

```bash
node scripts/run-checks.js integration
node scripts/run-checks.js --list
node scripts/run-checks.js all --continue   # no corta al primer fallo
```

Los comandos `check:*` individuales (`check:api`, `check:leads`, `check:e2e`,
`check:admin`, `check:social`, `check:content`, `check:newsletter`,
`check:nota-ssr`, `check:scraper`) se conservan sin cambios.

## Variables requeridas

- `DATABASE_URL` — Postgres real, con migraciones aplicadas.
- `JWT_SECRET` — usado por login.
- `CHECK_PORT` — puerto donde cada check levanta la API (opcional, cada
  script tiene un default distinto).
- `CHECK_STUB_PORT` — puerto del stub HTTP local en `check-competitor-scraper.js`.
- `CHECK_PASSWORD` — password de los usuarios de check (default `crea2026`).

```bash
CHECK_PORT=4100 npm run test:public
```

## ⚠️ Advertencia

Los checks pegan contra la `DATABASE_URL` real (crean, modifican y borran
filas). **Nunca correrlos contra la base de producción** — solo local, dev
o una base de test dedicada.

## Convención de datos de prueba

- Emails de usuarios de prueba: `*@test.crea` o el patrón `check-*@crearcontenidos.com`
  que ya usan los checks existentes.
- Títulos/slugs de contenido de prueba: prefijo `check-` o `[check]`.
- Todo dato creado por un check se limpia en su bloque `finally`, para que el
  check sea re-ejecutable.

## Cómo agregar un nuevo check

1. Crear `apps/api/scripts/check-<area>.js`.
2. Usar los helpers de `apps/api/scripts/lib/check-helpers.js` (`startApi`,
   `stopApi`, `waitForHealth`, `login`, `postJson`/`patchJson`/`deleteJson`,
   `runMigrate`/`runSeed`, `createPool`) en vez de reimplementarlos.
3. Limpiar los datos creados en `finally`, incluso si el check falla.
4. Agregarlo al grupo correspondiente en `apps/api/scripts/run-checks.js`.
5. Si merece un alias directo, agregar `check:<area>` en `apps/api/package.json`.

## Límites conocidos

- Sin aislamiento perfecto por test: la DB es compartida entre checks.
- Rate limits viven en memoria del proceso del server; por eso cada check
  corre en su propio proceso y `run-checks.js` los ejecuta como procesos
  separados en vez de paralelizarlos.
- `check-admin-api.js` es un smoke e2e amplio, no una prueba granular.
