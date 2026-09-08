# Fase 1 — Feedback y aprendizaje editorial (punto 16)

> Depende de: `00-preparacion.md` (R2-03, para el patrón de migración aditiva) · Habilita: nada
> técnicamente, pero **empieza a acumular valor desde el día que se activa** · Prioridad: **P0**
> Puede ir en paralelo con absolutamente todo lo demás: no comparte archivos con otras fases.

## Por qué va primero aunque sea "el último punto de la lista"

Es el ítem más barato del backlog y el único cuyo valor depende del tiempo transcurrido. Un
dataset de criterio editorial que empieza a llenarse desde la edición 1 vale mucho más que uno
perfecto que empieza en la edición 40. Todo lo demás se puede construir después sin perder nada;
esto no.

## Qué existe hoy (no lo reinventes)

- **Rechazar propuesta** (`modules/editorial/index.js:156-171`) y **devolver pieza**
  (`lib/editorial-review.js:33`) **ya exigen motivo obligatorio** — 400 si viene vacío. Se guarda en
  `content_proposals.review_comment` (texto libre, columna única que **se sobrescribe**).
- Devolver desde Telegram sí registra en `activity_log` (`modules/telegram/index.js:80-86`,
  acción `telegram_return`) — es la única vía que ya deja bitácora.
- `GET /api/listening/radar-stats` (`modules/listening/index.js:478`) ya emite *hints* de
  calibración a partir de agregados simples (ver ejemplo en `:588-599`). Es el lugar natural para
  los agregados de motivos, no un endpoint nuevo.
- `activity_log` (`migrations/017`) es **append-only** con `metadata JSONB` — no hace falta tabla
  nueva para el historial.

## Las cuatro brechas reales

1. Sin taxonomía: todo es prosa libre.
2. `review_comment` se sobrescribe: una pieza devuelta tres veces conserva solo el último motivo.
3. `/reject` y `/return` del panel **no** escriben en `activity_log` (Telegram sí lo hace, para el
   mismo tipo de acción — inconsistencia a corregir).
4. Los descartes de temas en RADAR (`DELETE /topics/:id` y el batch) no capturan nada. Es la
   decisión más frecuente del día.

## Tareas

### R2-05 — Taxonomía de motivos + columna

- **Módulo:** `api/editorial`
- **Archivos:** `apps/api/src/db/migrations/0NN_review_reason_code.sql` *(nuevo)*,
  `apps/api/src/lib/editorial-reasons.js` *(nuevo)*
- **Hacer:** columna `content_proposals.review_reason_code TEXT` — **sin CHECK rígido al inicio**,
  para poder ajustar la taxonomía sin migración; validar en la capa de aplicación, igual que ya se
  hace con `SECTIONS` en `modules/editorial/index.js:186-188`. Taxonomía inicial (10 valores):
  `dato_incorrecto`, `fuente_insuficiente`, `poca_relevancia`, `enfoque_incorrecto`, `tono`,
  `falta_contexto`, `interpretacion_excesiva`, `duplicado`, `tema_viejo`, `otro`.
- **Criterio de aceptación:** los 10 motivos definidos en un solo lugar (`editorial-reasons.js`),
  consumidos por API y panel — nada de listas duplicadas.
- **Clasificación:** AJUSTE MENOR.

### R2-06 — `reason_code` en rechazo y devolución + bitácora

- **Módulo:** `api/editorial`
- **Archivos:** `modules/editorial/index.js:156-171` (`/reject`), `:281-288` (`/return`),
  `lib/editorial-review.js:33`
- **Hacer:** aceptar y persistir `reason_code`; **el motivo libre sigue siendo obligatorio, no se
  reemplaza**. Agregar `logActivity()` a `/reject` y `/return` con `reason_code`, `proposal_id`,
  `verification_status` y (cuando exista, tras la fase `04`) `crea_score`.
- **Criterio de aceptación:** `/reject` y `/return` responden 400 si falta `reason_code`; ambos
  quedan en `activity_log` igual que ya lo hace `telegram_return`.
- **Clasificación:** AJUSTE MENOR.

### R2-07 — Motivo en descarte de temas de RADAR

- **Módulo:** `api/listening`
- **Archivos:** `modules/listening/index.js:254` (`DELETE /topics/:id`), `:223` (batch delete)
- **Hacer:** exigir `reason_code` con la misma taxonomía de `R2-05`; registrar en `activity_log`
  con `topic_id`, `verification_status` y `crea_score` cuando exista.
- **Criterio de aceptación:** descartar un tema (individual o en lote) sin motivo responde 400;
  cada descarte queda en bitácora.
- **Clasificación:** AJUSTE MENOR.

### R2-08 — Selectores de motivo en el panel

- **Módulo:** `admin`
- **Archivos:** `apps/admin/src/screens/aprobacion.ts:36-40` (modal de devolución),
  `apps/admin/src/screens/propuestas.ts:26-28` (rechazo), `apps/admin/src/screens/radar.ts`
  (drawer de ficha, acción de descarte), `apps/admin/src/actions.ts:721`
- **Hacer:** un `<select>` con los 10 motivos en cada uno de los tres flujos. Sigue las
  convenciones vigentes del panel — ver
  [`../panel_admin_convenciones.md`](../panel_admin_convenciones.md): acción nueva = entrada en
  `clickHandlers`, badges desde `STATUS_STYLE_MAP` si aplica, nada de estilos inline nuevos.
- **Criterio de aceptación:** no se puede rechazar, devolver ni descartar sin elegir motivo;
  `npx tsc --noEmit` y el E2E de `radar.spec.ts` en verde.
- **Clasificación:** AJUSTE MENOR.

### R2-09 — Agregados de feedback en `radar-stats`

- **Módulo:** `api/listening`
- **Archivo:** `modules/listening/index.js:478-624`
- **Hacer:** extender la respuesta con motivos por frecuencia y ventana de tiempo; emitir al menos
  un *hint* nuevo derivado de ellos (ej. *"'duplicado' es el motivo más frecuente esta semana:
  revisar el umbral de similitud"*).
- **Criterio de aceptación:** el endpoint expone el agregado y al menos un hint accionable.
- **Clasificación:** AJUSTE MENOR. Prioridad P2 — no bloquea el resto.

## Cómo se convierte en aprendizaje (para cuando existan datos)

Sin ninguna infraestructura de ML nueva:

| Uso | Mecanismo |
|---|---|
| Prompts | motivos frecuentes del último mes → reglas negativas en `directiveBlock()` (`ai-client.js:177`), que ya antepone directrices al prompt |
| Scoring (fase `04`) | correlacionar `crea_score` con tasa de descarte por banda — si 80-100 se descarta igual que 40-60, el score está mal ponderado |
| Detección | `reason_code = 'duplicado'` frecuente → bajar el umbral de similitud (hoy 0.45, perilla documentada en `docs/ia/radar-calibracion.md`) |

## Qué NO hacer

- No construir un módulo de analítica nuevo. `radar-stats` ya existe para esto.
- No reemplazar `review_comment` (texto libre) por el código — ambos coexisten.

## Verificación

```bash
cd apps/api && node scripts/run-checks.js unit
cd apps/admin && npx tsc --noEmit && npm test && npm run build
```
