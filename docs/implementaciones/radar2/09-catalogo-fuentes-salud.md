# Fase 9 — Catálogo y salud de fuentes (addendum del Documento Maestro v2)

> Depende de: nada · Habilita: `07-explorer-grok.md` (el catálogo es lo que Grok/CREA Scout debe
> recorrer), mejora la confiabilidad de `02-api-senales-externas.md` · Prioridad: **P0/P1** ·
> Puede ir en paralelo con cualquier otra fase — es infraestructura de datos, no depende de código
> nuevo de las demás.

## Origen de esta fase

No viene del documento original de RADAR 2.0 ni del backlog inicial de la auditoría (`R2-01…R2-51`).
Viene del `Documento_Maestro_CREA_RADAR_2_0_Karol_v2.docx` (5 sep 2026), addendum verificado en
`docs/auditorias/RADAR-2.0-AUDITORIA.md` §25.2 y §25.6 (Bloque 9, `R2-52…R2-59`). Antes de tocar
código de esta fase, ten presente que **§25.1 de la misma auditoría ya descartó** el hallazgo de
"WordPress/Meta desconectados" del v2 — verificado como ya resuelto en el código actual. No lo
reabras.

## Qué existe hoy — y por qué no alcanza

| Tabla | Migración | Campos hoy | Lo que falta |
|---|---|---|---|
| `radar_sources` | 035 | `domain, label, trust, active, notes` | `last_crawl_at`, `last_error`, `engine`, `status` (`ok`/`stale`/`error`) |
| `competitor_facebook_accounts` | 031 | `label, handle_or_url, active` | `platform`, `priority`, `analyze_comments`, `last_scan_at`, `access_status`, `last_error`, `checkpoint` |

Ninguna de las dos tablas tiene columna de salud o frecuencia. El panel puede mostrar qué fuentes
existen, pero no *cuándo fue revisada por última vez ni si está viva*.

**Hallazgo de datos, no de esquema:** las cuentas semilla cargadas hoy en
`competitor_facebook_accounts` son *Diario de Xalapa*, *AVC Noticias* y *El Dictamen* — medios
**regionales**, no las páginas hiperlocales de Perote que el v2 pide como catálogo mínimo para el
Pulso de Conversación Digital: *Perote Noticias*, *Perote al Momento*, *La Voz del Pinahuizapan*,
*La Voz del Cofre*. Mientras el seed no cambie, el scraper apunta a fuentes equivocadas para el
producto piloto ("Buenos días, Perote").

## Tareas

### R2-52 — Campos de salud en `radar_sources`

- **Módulo:** `api/db`
- **Archivo:** `apps/api/src/db/migrations/0NN_radar_sources_health.sql` *(nuevo)*
- **Hacer:**
  ```sql
  ALTER TABLE radar_sources ADD COLUMN IF NOT EXISTS last_crawl_at TIMESTAMPTZ;
  ALTER TABLE radar_sources ADD COLUMN IF NOT EXISTS last_error TEXT;
  ALTER TABLE radar_sources ADD COLUMN IF NOT EXISTS engine TEXT;
  ALTER TABLE radar_sources ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok','stale','error'));
  ```
- **Criterio de aceptación:** filas existentes quedan con `status = 'ok'` por defecto; migración
  idempotente.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-53 — Campos de salud + checkpoint en `competitor_facebook_accounts`

- **Módulo:** `api/db`
- **Archivo:** `apps/api/src/db/migrations/0NN_fb_accounts_health.sql` *(nuevo)*
- **Hacer:**
  ```sql
  ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'facebook';
  ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 0;
  ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS analyze_comments BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS last_scan_at TIMESTAMPTZ;
  ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS access_status TEXT;
  ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS last_error TEXT;
  ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS checkpoint TEXT;
  ```
  `checkpoint` guarda una referencia a la última publicación procesada (id o URL), para que el
  siguiente corte sepa desde dónde continuar sin reprocesar todo.
- **Criterio de aceptación:** filas existentes migran con `analyze_comments = false` por defecto
  (no se activa análisis de comentarios sin decisión explícita — coincide con que `08` sigue sin
  resolver la adquisición).
- **Clasificación:** REQUIERE DESARROLLO.

### R2-54 — Actualizar salud en cada escaneo

- **Módulo:** `api/listening`
- **Archivos:** `modules/listening/index.js` (handler de `competitors/detect`),
  `lib/topic-detection.js` (`detectAndSaveTopics`)
- **Hacer:** cada corte (manual o por cron) actualiza `last_crawl_at`/`last_scan_at`, `status`/
  `access_status` y `last_error` de las fuentes que tocó. Un fallo de fuente (403, timeout, login
  wall) debe quedar visible en el panel sin tener que revisar logs.
- **Criterio de aceptación:** después de un corte, cada fuente tocada refleja su estado real;
  fuentes no tocadas conservan su último estado conocido (y con el tiempo pasan a `stale` si
  procede, según la regla que definas en `R2-52`).
- **Clasificación:** REQUIERE DESARROLLO.

### R2-55 — Panel: estado de salud por fuente

- **Módulo:** `admin`
- **Archivo:** `apps/admin/src/screens/radar.ts` (tab Fuentes)
- **Hacer:** cada fuente muestra su último corte y su último error, con el mismo lenguaje visual
  que ya usa `confidenceBand` (badges desde `STATUS_STYLE_MAP`, ver
  [`../panel_admin_convenciones.md`](../panel_admin_convenciones.md) — no inventar un sistema de
  color nuevo).
- **Criterio de aceptación:** un editor puede ver de un vistazo qué fuente está viva y cuál lleva
  días sin responder.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-56 — Reemplazar seed de Facebook por catálogo de Perote

- **Módulo:** `api/db`
- **Archivo:** `apps/api/src/db/migrations/0NN_fb_accounts_perote_seed.sql` *(nuevo, solo datos)*
- **Hacer:** insertar (o reemplazar el seed histórico de 031) con: Perote Noticias, Perote al
  Momento, La Voz del Pinahuizapan, La Voz del Cofre. **Antes de escribir la migración, valida a
  mano que cada URL exista, sea pública y corresponda a la página correcta** — no actives una
  fuente sin confirmar. Deja `active = false` para cualquier página que no puedas confirmar en el
  momento de escribir la migración, y actívala después manualmente desde el panel.
- **Criterio de aceptación:** el catálogo activo de Facebook corresponde a medios de Perote, no a
  medios regionales de Xalapa.
- **Clasificación:** AJUSTE MENOR (dato, no esquema). **Prioridad P0** — es prerrequisito real
  para cualquier prueba seria de `08-conversacion-digital.md` o de `07-explorer-grok.md` sobre el
  producto piloto.

## Qué NO hacer

- No activar `analyze_comments = true` para ninguna fuente hasta que
  `08-conversacion-digital.md` (`R2-44`/`R2-45`) resuelva la adquisición.
- No borrar el seed histórico (Diario de Xalapa, AVC Noticias, El Dictamen) si todavía se usa en
  algún flujo de competencia regional — desactívalo (`active = false`) en vez de eliminarlo, salvo
  que se confirme que no se usa en ningún otro lugar.
- No inventar un segundo sistema de "salud" distinto para cada tabla — usa el mismo vocabulario
  (`status: ok/stale/error`, `last_error`) en ambas.

## Verificación

```bash
cd apps/api
node scripts/run-checks.js unit
node scripts/check-listening.js
psql "$DATABASE_URL" -c "SELECT label, platform, active, status FROM competitor_facebook_accounts;"
cd ../admin && npx tsc --noEmit
```

## Siguiente fase

Con el catálogo de Perote activo y con salud visible, `07-explorer-grok.md` tiene un catálogo real
que recorrer, y una prueba de acceso de Grok Bot sobre estas páginas específicas deja de ser
hipotética.
