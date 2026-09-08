# Fase 0 — Preparación

> Depende de: nada · Habilita: todas las demás fases · Prioridad: **P0**
> Lee primero [`README.md`](./README.md) (reglas transversales) si no lo has hecho.

## Objetivo

Dejar la base lista para que la ingesta externa (fase 2) y el resto de RADAR 2.0 no hereden deuda
que hoy es barata de resolver y después no. Nada de esta fase depende de que exista una sola línea
de código nueva de las fases siguientes.

## Qué existe hoy

- `topics` (`apps/api/src/db/migrations/002, 013, 023, 024, 034`) **no tiene ningún índice** más
  allá de la PK. `findRecentSimilarTopic()` (`lib/topic-detection.js:67`) hace `similarity()` sobre
  la ventana de 24 h en *sequential scan*.
- `pg_trgm` ya está habilitado (`migrations/032`) — el índice GIN que falta puede usarlo.
- `scripts/check-listening.js:374` documenta explícitamente: *"happy-path de detección/generación
  con IA real no cubierto (requiere mock de fetch)"*. Todo lo que se construya en las fases
  siguientes cae por defecto en esa zona sin cobertura si no se resuelve aquí.
- No existe ningún documento que fije el contrato de una señal externa. El "formato" hoy es
  implícito: lo que los prompts piden y `normalizeVerification()` tolera.
- Hay documentación desalineada con el código que puede confundir a un agente que la lea antes que
  el código: `docs/ia/especificacion-pipeline.md:84` dice que el newsletter no tiene tabla ni
  módulo (tiene ambos); `docs/ia/politica-ia-y-gate-editorial.md:1.1` dice que content-engine usa
  Claude/`ANTHROPIC_API_KEY` (usa Nous/OpenRouter).

## Tareas

### R2-01 — Índices en `topics`

- **Módulo:** `api/db`
- **Archivo:** `apps/api/src/db/migrations/0NN_topics_indexes.sql` *(nuevo, siguiente número libre)*
- **Hacer:**
  ```sql
  CREATE INDEX IF NOT EXISTS idx_topics_detected_at ON topics (detected_at DESC);
  CREATE INDEX IF NOT EXISTS idx_topics_title_trgm ON topics USING GIN (title gin_trgm_ops);
  ```
- **Criterio de aceptación:** `EXPLAIN ANALYZE` de la consulta de `findRecentSimilarTopic` deja de
  mostrar `Seq Scan` sobre `topics`; `node scripts/run-checks.js unit` sigue en verde.
- **Clasificación:** REQUIERE DESARROLLO (trivial).

### R2-02 — Stub de `fetch` reutilizable para pruebas de IA

- **Módulo:** `api/tests`
- **Archivos:** `apps/api/scripts/lib/check-helpers.js` *(nuevo o extender si ya existe algo
  similar)*, consumido por `apps/api/scripts/check-listening.js:374`
- **Hacer:** un helper que reemplace `global.fetch` (o el cliente HTTP que use `ai-client.js`) con
  una función que devuelve respuestas JSON fijas por patrón de URL/modelo, sin red real. Debe
  poder simular: respuesta válida, JSON malformado (para probar `parseJson()`), y error HTTP.
- **Criterio de aceptación:** existe al menos un test que ejercita `detectAndSaveTopics()` o
  `generateProposal()` de punta a punta sin llamar a ninguna API de pago, y que falla si
  `normalizeVerification()` se rompe. Toda fase que agregue IA nueva (`03`, `07`) debe usar este
  mismo helper, no inventar uno propio.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-03 — Contrato de señal externa, documentado y versionado

- **Módulo:** `docs`
- **Archivo:** `docs/ia/contrato-senales-externas.md` *(nuevo)*
- **Hacer:** fijar el schema de señal con `schema_version`. Usa como base los 17 campos del
  documento original (ID de señal, título, descripción, fecha de detección, fecha del
  acontecimiento, localidad, alcance territorial, categoría, fuente+URL, tipo de fuente, resumen
  factual, confianza, fuentes corroborantes, relevancia potencial, comentarios disponibles,
  multimedia disponible, estado de verificación) **y fusiona además** los campos del v2 que no
  estaban en el original:
  - `provider` (string), `botRunId` (string), `sourceId` (string, referencia al catálogo de `09`).
  - `accessStatus` enum: `ok | login_required | captcha | blocked | error`.
  - `conversationSnapshot` (objeto opcional): `{ period: {from, to, timezone}, sourcesObserved,
    sampleMethod, postsAnalyzed, commentsAnalyzed, themes, recurringQuestions, concerns,
    supportFrames, criticismFrames, claimsToVerify, amplificationSignals, limitations }` — solo se
    llena si el proveedor analizó conversación; queda vacío para señales que no la incluyen.
  - Regla explícita: *una señal externa entra siempre como `signal` o `checking`, nunca como
    `verified` por venir de un proveedor de confianza declarada.*
- **Criterio de aceptación:** un tercero puede implementar un proveedor de señales leyendo
  únicamente este documento, sin ver el código del proyecto.
- **Clasificación:** REQUIERE DESARROLLO (documental).

### R2-04 — Corregir documentación desalineada

- **Módulo:** `docs`
- **Archivos:** `docs/ia/especificacion-pipeline.md`, `docs/ia/politica-ia-y-gate-editorial.md`
- **Hacer:** corregir o marcar explícitamente como histórico cada afirmación que ya no coincide con
  el código (ver lista en "Qué existe hoy" arriba).
- **Criterio de aceptación:** ningún documento en `docs/ia/` afirma como pendiente algo ya
  implementado, ni al revés.
- **Clasificación:** AJUSTE MENOR. Prioridad P2 — no bloquea nada, pero hazlo antes de que un
  agente futuro lea esos documentos y diagnostique mal el estado del proyecto.

## Qué NO hacer

- No crear el endpoint `POST /api/signals` en esta fase — eso es `02-api-senales-externas.md`.
- No decidir todavía los pesos del CREA Score ni los niveles de profundidad del Motor Editorial —
  esas decisiones editoriales viven en `03` y `04` y **bloquean** esas fases si no se resuelven ahí,
  no aquí.

## Verificación

```bash
cd apps/api
node scripts/run-checks.js unit
# confirma que el nuevo índice existe:
psql "$DATABASE_URL" -c "\d topics"
```

## Siguiente fase

Con `R2-01`, `R2-02` y `R2-03` cerrados, `01-feedback-editorial.md` y `02-api-senales-externas.md` /
`03-motor-editorial.md` pueden arrancar en paralelo. `09-catalogo-fuentes-salud.md` no depende de
esta fase y puede ir en paralelo desde ya.
