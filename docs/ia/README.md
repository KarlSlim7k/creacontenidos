# Documentación de IA — CREA Command Center v2

> Adaptado de `crea_web` (v1, repo hermano) para dar continuidad a las decisiones editoriales
> y de arquitectura de IA que ya se tomaron, sin arrastrar el código ni el schema de v1
> (nombres de tabla en español, servicios independientes, Hermes Agent) que **no** aplican
> a este monorepo. v1 es referencia de alcance y de decisiones ya validadas, no fuente de código
> — mismo principio que ya aplican las skills `fullstack` y `automation-pipeline`.

## Cómo se relaciona con lo demás en `docs/`

| Documento | Qué cubre |
|---|---|
| [`CREA_Stack_IA_Actualizado_v1.md`](./CREA_Stack_IA_Actualizado_v1.md) | **Supersedido.** Decisión de negocio original (Hermes Agent + Nous Portal + MiniMax) para el mes de pruebas — ya no describe el stack real, se conserva como histórico. |
| [`stack-ia-servicios-costos.md`](./stack-ia-servicios-costos.md) | Stack de IA **vigente**: qué proveedor sirve cada capa (texto/imagen/audio/búsqueda) y por qué. |
| [`../planes/PLAN_v1.md`](../planes/PLAN_v1.md) | Plan completado del apartado público (portal + Estudio). Explícitamente dejó fuera listening/content-engine. |
| Esta carpeta (`ia/`) | La capa que `PLAN_v1.md` dejó fuera: políticas editoriales/IA y qué hacen `listening`, `content-engine`, `distribution` — ya implementados, ver estado abajo. |

## Archivos

- [`identidad-editorial.md`](./identidad-editorial.md) — voz editorial de CREA (system prompt) que debe usar `content-engine` al llamar al modelo. Directamente reutilizable de v1, con los nombres de campo actualizados al schema real de v2.
- [`politica-ia-y-gate-editorial.md`](./politica-ia-y-gate-editorial.md) — reglas de ruteo de modelos, costo, y gate editorial. Señala explícitamente qué ya está implementado en `apps/api/src/modules/editorial` y qué sigue pendiente.
- [`especificacion-pipeline.md`](./especificacion-pipeline.md) — qué debe hacer cada capa (`listening` → `content-engine` → `editorial` → `distribution`) para que el pipeline funcione de punta a punta. Traduce las specs de skills de Hermes (v1) a procedimientos concretos sobre el schema y los módulos Express de v2 — sin Hermes, sin Telegram, sin microservicios.
- [`runbook-incidentes.md`](./runbook-incidentes.md) — qué hacer cuando falla un proveedor de IA, falla una publicación, o se detecta contenido sensible. Recortado de la versión v1 (sin broker de eventos, sin Mac mini/OpenClaw — no existen en esta arquitectura).
- [`casos-uso-hermes.md`](./casos-uso-hermes.md) — escenarios que justificarían desplegar Hermes completo, límites de seguridad y criterios para no añadirlo antes de tiempo.

Ver también [`../adr/0001-ia-hibrida-gate-editorial.md`](../adr/0001-ia-hibrida-gate-editorial.md).

## Estado de implementación (2026-07-28)

`listening`, `content-engine`, `distribution` y `editorial` ya están implementados (no quedan esqueletos `// TODO`) — RADAR (listening) con paginación/filtros/gate editorial, content-engine generando propuesta/borrador/QA/imagen vía los proveedores reales de [`stack-ia-servicios-costos.md`](./stack-ia-servicios-costos.md), editorial con el pipeline completo (`propuesta → borrador → en_revision → published | rechazada`) incluyendo `origin` para transparencia IA. Estos documentos siguen siendo la referencia de política/spec, ya no la descripción de un esqueleto pendiente.
