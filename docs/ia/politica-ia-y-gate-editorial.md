# Política de IA y gate editorial

> Adaptado de `crea_web/packages/policies/ai-routing-policy.md` y `editorial-gate-policy.md`
> (v1). Mismas reglas de negocio; se marca explícitamente qué ya existe en el código de v2
> (`apps/api/src/modules/editorial`) y qué sigue siendo una regla a implementar.

## 1. Ruteo de modelos

### 1.1 Qué usa v2 hoy (planeado, sin conectar)

Por `apps/api/src/modules/{listening,content-engine}/README.md` y la skill `fullstack`:

- **`listening`**: Perplexity Sonar API (`sonar-pro`) para detección de temas, `ANTHROPIC_API_KEY` no aplica aquí.
- **`content-engine`**: Claude API (`ANTHROPIC_API_KEY`) para redacción de las 5 propuestas por tema.

### 1.2 Decisión de negocio vigente

[`../CREA_Stack_IA_Actualizado_v1.md`](../CREA_Stack_IA_Actualizado_v1.md) (Julio 2026, vigente) define que para el mes de pruebas el punto de entrada de IA es **Hermes Agent + Nous Portal + MiniMax como modelo primario**, con un modelo de razonamiento superior reservado para piezas sensibles/branded content de alto valor. Esa decisión **no cambia el schema ni los límites de los módulos** — solo determina qué proveedor y qué variables de entorno llama el código de `listening`/`content-engine` cuando se implementen. Antes de escribir el cliente HTTP de esas capas, confirmar contra ese documento si se llama a Anthropic/Perplexity directo o vía Nous Portal — es una decisión de una línea de configuración, no de arquitectura.

### 1.3 Reglas de ruteo por tipo de tarea (heredadas de v1, siguen aplicando)

| Tarea | Modelo recomendado |
|---|---|
| Clasificación de sentimiento, deduplicación, sugerencia de formato | Modelo económico (Gemini Flash / MiniMax) — 10x más barato, calidad suficiente para tareas estructuradas |
| Redacción editorial final (nota, post, guiones) | Modelo premium (Claude Sonnet) — mantiene la voz CREA de [`identidad-editorial.md`](./identidad-editorial.md) |
| Revisión de piezas sensibles o branded content de alto valor | Modelo de razonamiento superior, uso puntual |

### 1.4 Reglas de costo (pendientes de implementar)

Ninguna de estas existe en el código todavía — quedan como requisito para cuando `content-engine`/`listening` dejen de ser esqueletos:

1. Definir presupuesto diario y por módulo.
2. Emitir alerta al 80% del presupuesto.
3. Bloquear tareas no críticas al 100% y usar fallback a modelo económico.
4. Registrar qué modelo generó cada propuesta — **gap de schema**: `content_proposals` no tiene columna equivalente a `modelo_ia_usado`/`tokens_ia` de v1. Si se decide trazar esto, es una migración `ALTER TABLE content_proposals ADD COLUMN model_used TEXT, ADD COLUMN tokens_used INTEGER` — no crear tabla nueva para esto (YAGNI).

### 1.5 Reglas de seguridad

- No enviar datos sensibles sin anonimizar a proveedores externos.
- Guardar trazabilidad para auditoría — hoy `review_comment` cubre el motivo de rechazo/devolución; no hay traza de "qué modelo generó esto" (ver 1.4).

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
