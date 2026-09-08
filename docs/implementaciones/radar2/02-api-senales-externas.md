# Fase 2 — API de señales externas (punto 9)

> Depende de: `00-preparacion.md` (R2-03, contrato de señal) · Habilita: `07-explorer-grok.md` ·
> Prioridad: **P0** · Puede ir en paralelo con `03-motor-editorial.md` (no comparten archivos: el
> Motor Editorial corre sobre los temas que RADAR ya detecta hoy, no necesita esperar a esta fase).

## Objetivo

Abrir una entrada *push* de señales sin escribir de nuevo la verificación, el dedupe ni el merge
que ya existen — todo eso se reutiliza tal cual.

## Qué existe hoy

Las tres formas actuales de que entre una señal a `topics` son *pull* (CREA sale a buscar):
detección manual (`POST /api/listening/topics/detect`), cron cada 6 h, y escaneo de Facebook. **No
existe ninguna entrada donde un agente externo entregue un hallazgo.**

Lo que sí existe y es directamente reutilizable:

- **`insertTopicIfNew(topicRaw, overrides, options)`** (`lib/topic-detection.js:112`) — punto único
  de escritura, ya usado por los tres caminos actuales. Encadena: refuerzo multi-fuente → trust de
  dominios → normalización → búsqueda de similar en 24 h → INSERT o UPDATE-merge. **Un endpoint que
  llame a esta función hereda todo eso sin escribir una línea de esa lógica.**
- **`topic-verification.js` completo** — módulo puro, sin DB, ya calibrado.
- **`radar_sources` + `applyTrustFromSources()`** — la confianza de un proveedor externo se resuelve
  con la lista editorial que ya existe.
- **Patrón de autenticación de máquina**: `POST /api/telegram/webhook`
  (`modules/telegram/index.js:89-90`) — secreto de header comparado con `crypto.timingSafeEqual`,
  idempotencia contra tabla propia por id externo, 200 ante duplicado. **Es el molde exacto** para
  la auth de la ingesta.
- **`migrations/034` como plantilla** de migración aditiva con `IF NOT EXISTS` + CHECK sin romper
  filas legacy.

## Comparación contra el contrato (`docs/ia/contrato-senales-externas.md`, de `R2-03`)

6 de los 17 campos ya existen completos en `topics` (título, fecha de detección, confianza,
resumen factual como `known_facts`, fuentes corroborantes como `evidence[]`+`source_count`, estado
de verificación). Los 6 que **no existen y hay que agregar**: `event_date`, `locality`,
`territorial_scope`, `category`, `provider`, `external_id`. El resto son parciales que ya se
resuelven con columnas existentes.

## Tareas

### R2-10 — Campos de señal en `topics` (migración aditiva)

- **Módulo:** `api/db`
- **Archivo:** `apps/api/src/db/migrations/0NN_signal_fields.sql` *(nuevo)*
- **Hacer:**
  ```sql
  ALTER TABLE topics ADD COLUMN IF NOT EXISTS event_date TIMESTAMPTZ;
  ALTER TABLE topics ADD COLUMN IF NOT EXISTS locality TEXT;
  ALTER TABLE topics ADD COLUMN IF NOT EXISTS territorial_scope TEXT;
  ALTER TABLE topics ADD COLUMN IF NOT EXISTS category TEXT;
  ALTER TABLE topics ADD COLUMN IF NOT EXISTS provider TEXT;
  ALTER TABLE topics ADD COLUMN IF NOT EXISTS external_id TEXT;
  ALTER TABLE topics ADD COLUMN IF NOT EXISTS media_available BOOLEAN;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_provider_external_id
    ON topics (provider, external_id) WHERE external_id IS NOT NULL;
  ```
- **Criterio de aceptación:** filas legacy quedan con todos estos campos en NULL; `npm run migrate`
  idempotente; ningún check existente se rompe.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-11 — Registro de proveedores con API key

- **Módulo:** `api/db` + `auth`
- **Archivos:** `apps/api/src/db/migrations/0NN_signal_providers.sql` *(nuevo)*,
  `apps/api/src/lib/signal-auth.js` *(nuevo)*
- **Hacer:** tabla `signal_providers (id, name, api_key_hash, trust, active, created_at)`. Auth:
  hash en reposo, comparación en tiempo constante (`crypto.timingSafeEqual`, mismo patrón que
  `modules/telegram/index.js:14-18`), revocable vía `active = false`. **Nunca loguear la key en
  claro.**
- **Criterio de aceptación:** una key válida autentica; una revocada o inválida responde 401; la
  key nunca aparece en logs ni en `activity_log`.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-12 — `POST /api/signals` con validación e idempotencia

- **Módulo:** `api/listening`
- **Archivo:** `apps/api/src/modules/signals/index.js` *(nuevo)*, montado en
  `apps/api/src/server.js:131-143`
- **Hacer:**
  - Auth vía `R2-11`.
  - Validar contra el contrato de `R2-03` (17 campos + extensiones del v2).
  - Escribir **exclusivamente** vía `insertTopicIfNew()` — no un INSERT propio.
  - Responder por señal: `inserted` (201) / `upgraded` (200, merge con tema existente) /
    `duplicate` (200, mismo `provider`+`external_id` ya visto) / `rejected` (400, con el motivo).
  - Límite de payload propio para esta ruta (el global es 100 kB en `server.js:100` — decidir a
    propósito si necesita ser distinto, no heredarlo por accidente).
  - Aceptar lote pequeño (varias señales en un solo POST), no solo una por request.
- **Criterio de aceptación:** ver tabla de casos en la sección "Verificación" abajo.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-13 — Adaptador de señal externa → forma interna

- **Módulo:** `api/lib`
- **Archivo:** `apps/api/src/lib/signal-adapter.js` *(nuevo)*
- **Hacer:** mapear los 17+ campos del contrato a la forma que espera `insertTopicIfNew()`.
  `evidence[]` se construye desde fuente original + fuentes corroborantes del payload;
  `provider.trust` participa vía `applyTrustFromSources()` igual que un dominio de
  `radar_sources`.
- **Criterio de aceptación:** una señal con los 17 campos completos produce un `topics` row
  idéntico en forma a uno producido por los caminos actuales (Firecrawl/Perplexity/Facebook).
- **Clasificación:** REQUIERE DESARROLLO.

### R2-14 — Registry de proveedores de descubrimiento (desacoplar la cadena fija)

- **Módulo:** `api/lib`
- **Archivo:** `apps/api/src/lib/topic-detection.js:227-255`
- **Hacer:** extraer la cadena Firecrawl→Perplexity, hoy escrita a mano con `provider`/`model`/
  `metaExtra` inline, a un registry donde añadir un proveedor no requiera editar
  `detectAndSaveTopics()`. Este es el paso que hace segura la incorporación futura de Grok
  (`07-explorer-grok.md`) sin acoplar el API a un proveedor específico.
- **Criterio de aceptación:** Firecrawl y Perplexity siguen funcionando exactamente igual;
  `node scripts/check-listening.js` en verde.
- **Clasificación:** REQUIERE DESARROLLO. Prioridad P1 (no bloquea el MVP, pero sí a `07`).

### R2-15 — Panel: origen y procedencia de la señal

- **Módulo:** `admin`
- **Archivos:** `apps/admin/src/screens/radar.ts` (ficha y tabla), `apps/admin/src/store.ts:203`
  (tipo `Topic`)
- **Hacer:** mostrar proveedor, fecha del hecho, localidad y alcance territorial en la ficha,
  **null-safe** para temas legacy (que no tendrán estos campos).
- **Criterio de aceptación:** un tema creado por ingesta externa muestra su procedencia; un tema
  legacy no rompe el render.
- **Clasificación:** REQUIERE DESARROLLO. Prioridad P1.

### R2-16 — Checks de la ingesta

- **Módulo:** `api/tests`
- **Archivo:** `apps/api/scripts/check-signals.js` *(nuevo)*, registrado en
  `apps/api/scripts/run-checks.js`
- **Hacer:** cubrir auth (válida/inválida/revocada), validación de schema, idempotencia
  (`provider`+`external_id` repetido → `duplicate`), dedupe contra tema existente por similitud
  (→ `upgraded`), y payload inválido (→ `rejected` con motivo). Usa el stub de `fetch` de `R2-02`
  si el flujo toca IA — no debe gastar en APIs de pago.
- **Criterio de aceptación:** corre en CI (`.github/workflows/ci.yml`) sin llamadas reales.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-41 — Proveedor simulado (mover aquí desde la fase de Grok)

- **Módulo:** `scripts`
- **Archivo:** `apps/api/scripts/fake-signal-provider.js` *(nuevo)*
- **Hacer:** un script que empuje señales de prueba a `POST /api/signals` con una API key de
  proveedor real (creada vía `R2-11`). Debe permitir simular los 17+ campos del contrato,
  incluyendo `conversationSnapshot` opcional.
- **Por qué importa aquí y no en `07`:** es lo que permite validar **todo el contrato de esta
  fase** y recorrer el resto del MVP (`03`, `04`, `05`) sin depender de que la investigación sobre
  Grok haya terminado.
- **Criterio de aceptación:** con este script se puede recorrer el flujo completo
  `ingesta → verificación → análisis → score → boletín` con datos de prueba.
- **Clasificación:** REQUIERE DESARROLLO. **P0 — es parte del MVP.**

## Qué NO hacer

- No escribir en `topics` desde `modules/signals/index.js` con un INSERT propio — siempre
  `insertTopicIfNew()`.
- No marcar ninguna señal externa como `verified` automáticamente, sin importar el `trust`
  declarado del proveedor.
- No mezclar la auth de `signal_providers` con el JWT de usuario — son dos sistemas de auth
  distintos, como Telegram y el panel ya conviven hoy.

## Verificación

Casos que `R2-16` debe cubrir explícitamente:

1. Señal válida nueva → 201, `inserted`, aparece en `GET /api/listening/topics`.
2. La misma señal (`provider`+`external_id`) enviada dos veces → segunda vez `duplicate`, sin fila
   nueva.
3. Señal cuyo título es similar (>0.45) a un tema de las últimas 24 h → `upgraded`, merge de
   `evidence`, conserva título canónico.
4. Payload sin campos requeridos → 400 con el o los campos faltantes.
5. Sin API key o key revocada → 401.
6. Señal con `trust` de proveedor `high` → sigue entrando como `signal`/`checking`, nunca
   `verified` automático.

```bash
cd apps/api
node scripts/run-checks.js unit
node scripts/check-signals.js
node scripts/check-listening.js
cd ../admin && npx tsc --noEmit
```

## Siguiente fase

Con `R2-10…R2-16` y `R2-41` cerrados, el MVP puede recorrerse de punta a punta con datos simulados.
`07-explorer-grok.md` puede empezar (usa este mismo endpoint como destino).
