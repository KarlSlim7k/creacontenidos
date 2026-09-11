# Política de IA y gate editorial

> Adaptado de `crea_web/packages/policies/ai-routing-policy.md` y `editorial-gate-policy.md`
> (v1). Mismas reglas de negocio; se marca explícitamente qué ya existe en el código de v2
> (`apps/api/src/modules/editorial`) y qué sigue siendo una regla a implementar.

## 1. Ruteo de modelos

### 1.1 Qué usa v2 hoy

> **Corregido (2026-09-11, `R2-04`):** esta sección describía una decisión previa a la
> implementación. `content-engine` **no** usa Claude/`ANTHROPIC_API_KEY` — llama a
> `chatComplete()` (`lib/ai-client.js`), que pega a **Nous Portal** como proveedor primario con
> **OpenRouter** como respaldo cross-provider. `ANTHROPIC_API_KEY` no se usa en ningún punto de
> `listening` ni `content-engine` hoy. Detalle real y vigente: [`stack-ia-servicios-costos.md`](./stack-ia-servicios-costos.md).

Por el código real (`apps/api/src/lib/ai-client.js`, `apps/api/src/modules/{listening,content-engine}`):

- **`listening`**: Firecrawl (scrape) + `chatComplete()` (Nous Portal) cuando hay `FIRECRAWL_API_KEY` y URLs configuradas; si no, o si falla, Perplexity Sonar API (`sonar-pro`) vía `detectTopics()`. `ANTHROPIC_API_KEY` no aplica aquí.
- **`content-engine`**: `chatComplete()` (Nous Portal, modelo `AI_MODEL_DEFAULT`/`AI_MODEL_COMPLEX` según tarea) para redacción de propuesta y borrador, con fallback automático a OpenRouter — ver "Fallback implementado" abajo. No genera "5 propuestas por tema" en una sola llamada: cada formato se genera bajo demanda (`POST /api/content/generate-proposal` con `format` explícito).

### 1.2 Decisión de negocio vigente

[`../CREA_Stack_IA_Actualizado_v1.md`](../CREA_Stack_IA_Actualizado_v1.md) es la decisión de negocio **original** (Julio 2026, mes de pruebas) y está marcada **SUPERSEDIDO** en su propio encabezado — no describe el stack real. La referencia técnica vigente es [`stack-ia-servicios-costos.md`](./stack-ia-servicios-costos.md): Nous Portal como proveedor primario de texto, OpenRouter como respaldo, Perplexity para búsqueda en vivo, sin Hermes Agent ni MiniMax como punto de entrada único.

**Fallback implementado**: `apps/api/src/lib/ai-client.js` usa la cadena modelo solicitado en
Nous → `AI_MODEL_FALLBACK` en Nous → `AI_OPENROUTER_FALLBACK_MODEL` en OpenRouter. Solo avanza
por timeout/red, 402, 404, 408, 429 o 5xx; 400, 401 y 403 se detienen para corregir configuración.
El resultado registra proveedor, modelo, latencia, tokens y motivo sin guardar prompts ni cuerpos.
Ninguna salida se publica automáticamente: conserva el gate editorial humano.

### 1.3 Reglas de ruteo por tipo de tarea

> **Corregido (2026-09-11, `R2-04`):** la fila de "redacción editorial final" heredaba la
> decisión original de negocio (Claude Sonnet vía Anthropic). El código real rutea texto por
> `MODELS` en `lib/ai-client.js` (`AI_MODEL_DEFAULT`/`AI_MODEL_COMPLEX`/`AI_MODEL_QA`, todos vía
> Nous Portal, con `AI_MODEL_FALLBACK` en Nous y `AI_OPENROUTER_FALLBACK_MODEL` en OpenRouter
> como respaldo) — no hay una llamada directa a la API de Anthropic en ningún módulo.

| Tarea | Modelo real (config vigente) |
|---|---|
| Clasificación de sentimiento, deduplicación, detección de temas | `AI_MODEL_DEFAULT` (Nous) o Perplexity `sonar-pro` (búsqueda en vivo) |
| Redacción editorial final (nota, post, guiones), borrador, QA | `AI_MODEL_DEFAULT`/`AI_MODEL_COMPLEX`/`AI_MODEL_QA` según la llamada (Nous), fallback automático a `AI_MODEL_FALLBACK` (Nous) y luego `AI_OPENROUTER_FALLBACK_MODEL` (OpenRouter) — mantiene la voz CREA de [`identidad-editorial.md`](./identidad-editorial.md) vía system prompt, no vía elección de proveedor |
| Revisión de piezas sensibles o branded content de alto valor | Sin modelo dedicado distinto hoy; pasa por el mismo ruteo — el gate humano (§2) es lo que da la revisión extra, no un modelo de razonamiento superior aparte |

### 1.4 Reglas de costo

1. Definir presupuesto diario y por módulo. **Pendiente** — no existe en el código.
2. Emitir alerta al 80% del presupuesto. **Pendiente** — no existe en el código.
3. Bloquear tareas no críticas al 100% y usar fallback a modelo económico. **Pendiente** como
   política de presupuesto — lo que sí existe hoy es un rate-limit por usuario (no por gasto):
   `aiLimiter` en `content-engine` (30 llamadas/15 min) y `EDIT_NOTE_DAILY_LIMIT` (10/día) para
   el asistente de edición.
4. Registrar qué modelo generó cada propuesta — **ya implementado, corregido (2026-09-11):**
   no vía columna en `content_proposals` (no existe `model_used`/`tokens_used` ahí y no hace
   falta agregarla), sino vía `activity_log.metadata` en cada llamada (`logActivity()`,
   `lib/ai-client.js`): proveedor, modelo solicitado, modelo devuelto, tokens, latencia,
   si usó fallback y por qué. Expuesto en `GET /api/content/ai-usage`.

### 1.5 Reglas de seguridad

- No enviar datos sensibles sin anonimizar a proveedores externos.
- Guardar trazabilidad para auditoría — `activity_log.metadata` conserva proveedor/modelo y
  `review_comment` cubre el motivo de rechazo/devolución.

## 2. Gate editorial

### 2.1 Lo que ya está implementado (`apps/api/src/modules/editorial/index.js`)

- Todo contenido nuevo entra como `status='propuesta'` (equivalente al "draft" de v1).
- Solo `director`/`producción` pueden mover `propuesta → borrador` (aprobar) o `propuesta → rechazada` (rechazar, exige `review_comment`).
- Solo `director` puede publicar (`en_revision → published`), y solo si `origin` (ver [`identidad-editorial.md`](./identidad-editorial.md)) y `slug` están definidos.
- Solo `director` puede devolver una pieza en revisión a `borrador` (`return`, exige `comment`).
- Cambios posteriores a publicación: no hay versionado de contenido publicado todavía — publicar es terminal salvo que se edite directo en DB. Si se necesita "nueva versión crea nueva fila", es una decisión a tomar cuando surja el caso real, no antes.

### 2.2 Gap: doble aprobación para contenido sensible

v1 exigía doble aprobación para: acusaciones directas a personas/entidades, seguridad pública y
salud, menores de edad, contenido políticamente sensible en periodo electoral. v2 tiene el campo
`content_proposals.sensibilidad` (migración `014`) pero **ninguna ruta de `editorial/index.js`
lo lee ni condiciona el flujo con él** — hoy `publish` solo exige `origin` + `slug`,
independientemente de `sensibilidad`.

Si se decide cerrar este gap, la implementación mínima (ponytail): en `PATCH /proposals/:id/publish`, si `sensibilidad` está en un valor alto, exigir que `review_comment` no esté vacío (evidencia de que alguien ya lo revisó con criterio) antes de permitir la transición — sin tabla nueva de aprobaciones, sin segundo rol nuevo.

### 2.3 Evidencia requerida (ya cubierto parcialmente)

- Fuente primaria/secundaria verificable: responsabilidad editorial, no del código.
- Registro de revisión (quién, cuándo, decisión): `updated_at` + `author_id` + `review_comment` ya cubren esto sin tabla de auditoría separada.
