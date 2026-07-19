# Mejoras al módulo RADAR (apps/admin + apps/api)

Implementado en 3 fases (commits separados). Motivación: la pantalla traía toda la
tabla `topics` sin límite y filtraba en memoria, los stats podían quedar en
"cargando…" infinito y "limpiar todo" hacía N DELETEs paralelos.

## Fase 1 — escalabilidad y errores

- `GET /api/listening/topics` acepta `limit` (≤500) y `offset`. Sin `limit`
  conserva el comportamiento anterior (array completo) para no romper checks
  ni consumidores legacy. `verification_status=none` filtra `IS NULL` (antes
  imposible server-side).
- `GET /api/listening/topics/summary`: `{ total, by_verification, sources }`.
  Alimenta las tarjetas de resumen y los chips de fuente, que ya no pueden
  derivarse del array paginado.
- `DELETE /api/listening/topics` (director/produccion): borrado bulk; devuelve
  `{ deleted }` y loguea `radar_clear`. Las `content_proposals` quedan con
  `topic_id` NULL por `ON DELETE SET NULL` (migración 024).
- Admin: filtros de chips (fuente/workflow/verificación) van a la API; paginación
  con truco `limit+1` (si llegan PAGE+1 filas hay más — sin COUNT extra) y botón
  "Cargar más"; dedupe por id al concatenar páginas.
- `radar-stats`: error real inline con botón Reintentar (antes catch vacío →
  "cargando…" eterno) y guard contra respuestas fuera de orden al alternar 7d/30d.

## Fase 2 — UX

- `loadScreenData('radar')` carga solo el tab activo y cachea por tab; cambiar
  de tab ya no refetchea. Refresh explícito con botón ↻ Actualizar (temas +
  resumen + calibración).
- Chips de fuente dinámicos desde `summary.sources` (fallback: sources de los
  topics cargados). El filtro activo se conserva visible aunque no tenga topics.

## Fase 3 — deuda

- Guard de rol `canManageRadar()` unificado (estaba repetido 5 veces).
- `approve-topic` usa la fila devuelta por el API (antes asumía el patch local).
- Escaneo FB ya no muta `state.data` directamente.

## Decisiones / límites conocidos

- `preview-radar.html` se queda en la raíz: `docs/ia/radar-verificacion-plan.md`
  lo referencia como prototipo UX sandbox.
- "Limpiar todo" de Competencia sigue con N DELETEs (volumen bajo; si crece,
  mismo patrón bulk que topics).
- El drawer de ficha lee el topic del array en memoria; con paginación solo se
  puede abrir desde filas cargadas, así que no requiere fetch por id.

## Verificación

- `apps/api`: `npm run check:listening` — 85 asserts (incluye paginación, none,
  summary, bulk delete con re-seed).
- `apps/admin`: `npx tsc --noEmit` + `npm test` (unit) + E2E `radar.spec.ts`.
