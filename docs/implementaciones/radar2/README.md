# RADAR 2.0 — Especificación de implementación por fases

> Fuente de verdad del diagnóstico: [`docs/auditorias/RADAR-2.0-AUDITORIA.md`](../../auditorias/RADAR-2.0-AUDITORIA.md)
> (auditoría técnica sobre `master @ 74b5a3b`, 4 sep 2026, con addendum del 7 sep 2026 sobre el
> `Documento_Maestro_CREA_RADAR_2_0_Karol_v2`). Este directorio **no repite el diagnóstico**: lo
> convierte en tareas ejecutables, una fase por archivo, cada una autocontenida.

## Cómo usar estos documentos (para un agente IA)

1. Lee este README completo antes de tocar código — fija las reglas transversales.
2. Lee **una sola fase** a la vez (el archivo que te asignen). Cada fase trae el contexto mínimo
   que necesitas: qué existe hoy, qué reutilizar, qué construir, qué no tocar, cómo verificar.
   No necesitas leer la auditoría completa para ejecutar una fase.
3. Cada tarea tiene un ID estable (`R2-NN`) que viene de la auditoría. Si citas una tarea en un
   commit o PR, usa ese ID.
3. Cada migración SQL nueva usa el siguiente número libre en `apps/api/src/db/migrations/` — antes
   de crear una, corre `ls apps/api/src/db/migrations/ | tail -5` para confirmar el último número
   aplicado (hay numeración duplicada histórica en 020/021; no la repitas).
4. Al terminar una fase, corre su bloque de "Verificación" completo antes de darla por cerrada.
5. No avances a una fase cuyas dependencias (declaradas en el encabezado de cada archivo) no estén
   cerradas, salvo que el propio archivo diga que puede ir en paralelo.

## Mapa de fases

| Archivo | Punto(s) del documento | Prioridad | Depende de | Puede ir en paralelo con |
|---|---|---|---|---|
| [`00-preparacion.md`](./00-preparacion.md) | Transversal + catálogo de fuentes | P0 | — | — (va primero) |
| [`01-feedback-editorial.md`](./01-feedback-editorial.md) | 16 | P0 | `00` | Todo lo demás |
| [`02-api-senales-externas.md`](./02-api-senales-externas.md) | 9 | P0 | `00` | `03` |
| [`03-motor-editorial.md`](./03-motor-editorial.md) | 11 | P0 | `00` | `02` |
| [`04-crea-score.md`](./04-crea-score.md) | 12 | P0 | `02`, `03` | — |
| [`05-buenos-dias-perote.md`](./05-buenos-dias-perote.md) | 14 | P0 | `03`, `04` | — (cierre del MVP) |
| [`06-multiformato.md`](./06-multiformato.md) | 15 | P1 | `03` | `07` |
| [`07-explorer-grok.md`](./07-explorer-grok.md) | 10 | P1/investigación | `02` | `06` |
| [`08-conversacion-digital.md`](./08-conversacion-digital.md) | 13 | P2/investigación | investigación propia | — |
| [`09-catalogo-fuentes-salud.md`](./09-catalogo-fuentes-salud.md) | Addendum v2 | P0/P1 | — | Todo (es infraestructura de datos) |

El MVP (dos semanas, diez ediciones de "Buenos días, Perote") se cierra con `00 → 01 → 02 → 03 →
04 → 05`, más `09` en paralelo desde el día 1. `06`, `07` y `08` son posteriores al MVP.

## Reglas transversales (aplican a toda fase, no se repiten en cada archivo)

Estas cuatro ya son política vigente en el código y **ninguna fase puede debilitarlas**:

1. **Nada se publica, envía o distribuye sin acción humana explícita.** Ningún cron nuevo publica.
   `publishProposal` sigue exigiendo rol `director` + `origin` (`lib/editorial-review.js:16-23`).
2. **Los crons gastan lo mínimo.** Detectar y generar-boletín son automáticos; redactar, analizar
   en profundidad (nivel 3) y regenerar renders son siempre un click humano.
3. **Los gates avisan, no censuran.** El patrón correcto es `409 + force:true`, con el override
   registrado en `activity_log` (ver `content-engine/index.js:41-70`). Cualquier score o análisis
   nuevo que decida "esto no se muestra" está mal diseñado — debe ordenar u ocultar solo con
   confirmación humana, nunca de forma automática.
4. **Ningún dato numérico o factual se publica sin fuente en `evidence[]`.** Aplica también a los
   campos nuevos del Motor Editorial y del CREA Score.

Reglas de forma:

- **Migraciones siempre aditivas.** `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF
  NOT EXISTS`, sin `NOT NULL` sin `DEFAULT` sobre tablas con filas existentes. Patrón de
  referencia: `apps/api/src/db/migrations/034_*.sql` y `035_*.sql`. Cada migración en su propia
  transacción (lo hace `migrate.js` automáticamente).
- **Entidades nuevas de análisis van en tablas propias con FK a `topics`, nunca `ALTER TABLE
  topics` para añadir más responsabilidades.** `topics` ya carga señal cruda + verificación +
  ficha editorial parcial + ítem de agenda (~24 columnas). Ver `editorial_analyses` en
  `03-motor-editorial.md`.
- **Toda lógica de negocio no trivial es una función pura primero, con acceso a datos alrededor.**
  El modelo a imitar es `lib/topic-verification.js`: sin `pool.query` adentro, testeable sin DB.
  `lib/crea-score.js` y `lib/editorial-engine.js` deben seguir el mismo patrón.
- **Todo lo nuevo que llame a un modelo de IA reutiliza `chatComplete()` y `parseJson()`**
  (`lib/ai-client.js:115`, `:182`) — no un `fetch` nuevo a un proveedor. La cadena de fallback
  cross-provider ya existe y ya está calibrada.
- **Todo campo generado por IA se audita**: modelo, proveedor, tokens, en `activity_log.metadata`
  (patrón ya usado por `logActivity()` en todo el proyecto).
- **Compatibilidad hacia atrás sin flags.** Cuando una función cambia de firma para aceptar un
  parámetro nuevo (ej. `generateContent(selection)`), el caso sin ese parámetro **debe** producir
  el comportamiento actual exacto, para que los crons existentes no se rompan mientras se adopta
  lo nuevo. No se introducen feature flags: se hace el default seguro.
- **No se toca**: `lib/editorial-review.js`, el claim atómico de `POST /api/newsletter/send`
  (`modules/newsletter/index.js:107-120`), `middleware/auth.js`, las migraciones ya aplicadas, y el
  flujo `propuesta → borrador → en_revision → published`.

## Convención de commits y verificación

Cada fase indica su propio bloque de verificación. Como mínimo, antes de cerrar cualquier fase:

```bash
cd apps/api && node scripts/run-checks.js unit
cd apps/admin && npx tsc --noEmit
```

Si la fase toca RADAR específicamente, añade `node scripts/check-listening.js`. Si toca el panel,
añade `npm test` y `npm run build` en `apps/admin` (ver
[`panel_admin_convenciones.md`](../panel_admin_convenciones.md) para las reglas de UI vigentes —
aplican también a las pantallas nuevas de RADAR 2.0).

Mensajes de commit: una fase puede dividirse en varios commits, pero cada commit cita el ID de
tarea que cierra (`R2-NN`) en el cuerpo del mensaje, no en el título.

## Clasificación heredada de la auditoría

Cada tarea trae una clasificación que indica su naturaleza, no solo su tamaño:

- **AJUSTE MENOR** — cambio aditivo pequeño sobre algo que ya funciona.
- **REQUIERE DESARROLLO** — no existe, hay que construirlo.
- **REQUIERE INVESTIGACIÓN** — no se debe escribir código de producción hasta resolver una
  pregunta de producto, costo, legal o de acceso. Ver `07-explorer-grok.md` y
  `08-conversacion-digital.md`.
