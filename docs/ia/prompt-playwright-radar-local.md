# Prompt para Claude Code — pruebas E2E locales de RADAR (Playwright)

Copia todo el bloque de la sección siguiente y pégalo como prompt en Claude Code.

---

## Prompt (copiar desde aquí)

```
# Tarea: pruebas E2E locales de RADAR (verificación editorial) con Playwright

## Contexto del producto
Repo: **CREA Contenidos / Command Center** (`creacontenidos`).
Panel admin: SPA Vite en `apps/admin` (base path `/admin/`).
API: Express en `apps/api`.
Feature: **RADAR verificación editorial** (plan en `docs/ia/radar-verificacion-plan.md`, calibración en `docs/ia/radar-calibracion.md`).

Objetivo de RADAR: detectar temas y puntuarlos para no alimentar el pipeline con rumor/clickbait.

## Qué ya está implementado (no reimplementes; prueba)
1. **Schema `topics`**: `confidence`, `verification_status` (`verified|checking|signal|risk`), ficha (evidence, risk_flags, etc.) — migración `034`.
2. **Detección** rellena verificación (`topic-verification.js`, `topic-detection.js`).
3. **Gate** `POST /api/content/generate-proposal`: `risk` → 409 salvo `{ force: true }`.
4. **Multi-fuente / dedupe** por similarity + upgrade.
5. **Lista `radar_sources`** (trust high/medium/low) — migración `035`.
6. **Stats** `GET /api/listening/radar-stats?days=7|30` + UI calibración en RADAR.

## Entorno local

### Credenciales seed
- Email: `director@crearcontenidos.com`
- Password: `crea2026`
(Todos los users de `003_admin_seed.sql` usan la misma password.)

### Cómo levantar (elige según el host)
```bash
# Postgres + API (Docker)
docker compose up -d db api
# Health: el puerto host de la API suele ser API_HOST_PORT (default compose 3001).
# En este entorno a veces está en 3010. Detecta con:
curl -s http://127.0.0.1:3001/health || curl -s http://127.0.0.1:3010/health || curl -s http://127.0.0.1:3000/health

# Migraciones si hace falta (DB no publica puerto al host: ver skill verify o correr migrate en red del contenedor db)
# Seeds: npm run seed dentro de apps/api con DATABASE_URL correcto

# Admin en dev (Vite)
cd apps/admin && npm install && npm run dev
# → http://localhost:4001/admin/
# En :4001 el meta crea-api-base apunta a http://localhost:3000
# Si la API Docker está en 3001/3010, o bien:
#   a) expón/mapea API a :3000, o
#   b) cambia temporalmente el meta crea-api-base, o
#   c) prueba el admin servido por la API Docker: http://HOST:PORT/admin/ (mismo origen, ideal para E2E)
```

**Preferido para Playwright:** usar el admin embebido en la API Docker  
`http://127.0.0.1:<API_PORT>/admin/`  
(mismo origen → sin líos de proxy/CORS).

### Checks API ya existentes (correr también)
```bash
# Desde apps/api con DB alcanzable:
npm run check:listening   # ~71 asserts: normalize, insert, gate risk, radar-sources, radar-stats
```

## Tu trabajo con Playwright

1. **Instala/configura Playwright** solo si no existe (no rompas el monorepo: preferir carpeta `apps/admin/e2e` o `e2e/radar` con package local, o script en root documentado).
2. Escribe tests **estables** (selectores por texto visible / `data-action` donde exista; evita sleeps largos; usa `expect` con timeouts razonables).
3. **No gastes APIs de IA de pago** en el happy-path de “Buscar tendencias” a menos que el usuario tenga keys y lo pida. Para UI, usa **seed data** ya en BD.
4. Reporta: qué pasó / falló, screenshots en fallo, y si algo del seed no está (topics sin verification_status).

## Flujos E2E a cubrir

### A. Login
- Abrir `/admin/` (o la URL base que detectes).
- Login director / crea2026.
- Llegar al panel (nav visible, sin error de login).

### B. Navegar a RADAR
- Ir a pantalla **RADAR** (item de menú “RADAR”).
- Ver tabs: **Temas**, **Competencia**, **Fuentes**.

### C. Tab Temas — lista y verificación
- Debe haber filas de topics (seed).
- Columnas esperadas: tema, fuente, interés, **confianza**, **verificación**, acciones.
- Chips/filtros de verificación: Todos, Verificados, En verificación, Señales, Con riesgo, Sin evaluar.
- Filtrar **Con riesgo**: debe verse al menos el seed “Aumento de robos…” o similar con badge riesgo.
- Filtrar **Verificados**: ciclovía / corte de agua u otros verified del seed.

### D. Bloque Calibración
- Visible en Temas: texto “Calibración”, chips **7d** / **30d**.
- Click 7d y 30d no debe tumbar la página; stats deben seguir visibles (topics, propuestas, hints).

### E. Ficha de verificación (drawer)
- Click en un topic verified → drawer “FICHA DE VERIFICACIÓN” (o similar).
- Ver badges de status/confianza, secciones evidencia / riesgo / decisión si hay datos.
- Cerrar drawer.

### F. Gate de propuesta en risk (UI)
- Abrir topic **Riesgo alto**.
- Botón debe decir algo como **Forzar propuesta IA** (no el generate normal).
- Click → debe aparecer `confirm` del browser.
- **Cancelar** el confirm → no debe navegar a propuestas ni mostrar éxito de generación.
- (Opcional, solo si quieres API): con dialog accept + force, puede fallar por falta de keys de IA; no marques como bug de UI si el error es de proveedor.

### G. Tab Fuentes
- Abrir **Fuentes**.
- Lista de dominios (seed: perote.gob.mx, facebook.com, etc.) con trust Alta/Media/Baja.
- Si hay botón Activar/Desactivar (director): toggle una fuente low y verificar que el badge estado cambia (Activa/Off); **revertir** al final para no dejar el entorno sucio.

### H. Smoke API desde el test (request de Playwright, no solo UI)
Con el mismo origin o base API detectada:
- `POST /api/auth/login` → token
- `GET /api/listening/topics` → array con campos `confidence`, `verification_status`
- `GET /api/listening/radar-stats?days=30` → `topics.total`, `hints[]`, `knobs`
- `GET /api/listening/radar-sources` → length > 0
- `POST /api/content/generate-proposal` con `topic_id` de un topic `risk` **sin** force → **409** y `code: verification_risk`

## Criterios de éxito
- [ ] Login + RADAR cargan en local
- [ ] Filtros de verificación funcionan
- [ ] Calibración 7d/30d visible
- [ ] Ficha drawer se abre/cierra
- [ ] Risk muestra forzar + confirm cancelable
- [ ] Tab Fuentes lista seed
- [ ] Asserts API de risk gate y stats pasan
- [ ] `npm run check:listening` sigue verde (si puedes correrlo)
- [ ] README o comentario breve: cómo ejecutar los e2e (`npx playwright test …`)

## Restricciones
- No commits ni push a menos que te lo pida el usuario.
- No borrar la BD ni `docker compose down -v`.
- No hardcodear secrets reales; solo seed `crea2026`.
- No implementar features nuevas de RADAR; solo pruebas y fixes mínimos si un selector del panel está roto.
- Si el admin en :4001 no llega a la API, **documenta el puerto** y usa `/admin` servido por la API.

## Entregable
1. Suite Playwright ejecutable.
2. Comando exacto para correrla.
3. Resumen de resultados (pass/fail por flujo A–H).
4. Bugs encontrados con pasos de reproducción (si hay).
```

---

## Notas rápidas (humano)

| Tema | Detalle |
|------|---------|
| URL E2E recomendada | `http://127.0.0.1:<API_PORT>/admin/` (mismo origen) |
| Puerto API | Default compose `3001`; a veces `3010` vía `API_HOST_PORT` |
| Vite admin | `http://localhost:4001/admin/` — meta API `http://localhost:3000` |
| No gastar IA | No automatizar “Buscar tendencias” sin keys + intención explícita |
| Docs relacionadas | `radar-verificacion-plan.md`, `radar-calibracion.md` |
| Suite entregada | `apps/admin/e2e/` — ver su `README.md` |
| Correr E2E | `cd apps/admin/e2e && npm install && npx playwright test` |
| Rate limit login | 10/15min por IP en `/api/auth/login` — un login global + `storageState` |
| check:listening | Montar **repo completo** (`-v "$(pwd):/repo"`), no solo `apps/api` |

## Resultado de la primera corrida (local)

- **12/12** Playwright pass (~11s), API en `:3010`.
- `check:listening` **71 asserts** verde.
- Sin gasto de IA (no se tocó “Buscar tendencias”).
- Bug de infra (no de UI): rate-limit de login; mitigado en `global-setup.ts`.
