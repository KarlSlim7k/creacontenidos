# ADR-0001: IA híbrida con gate editorial obligatorio

> Adaptado de `crea_web/docs/adr/0001-hybrid-ai-and-editorial-gate.md` (v1). La decisión de
> fondo no cambió al pasar a v2; se reescriben el contexto y las consecuencias porque v1
> asumía arquitectura de microservicios con bus de eventos y v2 es un monolito Express
> modular (ver skill `fullstack`) — sin broker, sin contratos de eventos versionados.

## Estado

Accepted (heredado de v1, ratificado para v2).

## Contexto

CREA necesita balancear costo, velocidad y calidad editorial en un flujo continuo, sin perder
control humano sobre la publicación de contenido. v2 implementa esto como 4 módulos Express
(`listening`, `content-engine`, `editorial`, `distribution`) que se comunican leyendo/escribiendo
tablas compartidas en Postgres — no hay bus de eventos ni servicios independientes (a diferencia
de v1, que proponía `ingest-gateway`, `radar-context`, etc. como servicios separados).

## Decisión

1. Adoptar estrategia de IA híbrida: modelo económico para tareas estructuradas (clasificación,
   dedup, sugerencia de formato) + modelo premium para redacción editorial final — ver
   [`../ia/politica-ia-y-gate-editorial.md`](../ia/politica-ia-y-gate-editorial.md).
2. Mantener gate editorial obligatorio antes de publicar: **nada se publica sin aprobación
   humana explícita del rol `director`** — ya implementado en `apps/api/src/modules/editorial`
   (`PATCH /proposals/:id/publish`, `requireRole('director')`, exige `origin` + `slug`).
3. Operar por transición de estado en tablas compartidas (`topics.status`,
   `content_proposals.status`) en lugar de eventos versionados — decisión explícita de v2, no un
   recorte: el volumen del proyecto no justifica un bus de eventos, y cada capa siguiente ya sabe
   qué leer por el valor del campo `status` (ver skill `automation-pipeline`).

## Consecuencias

Positivas:
- Control de costo por ruteo inteligente entre modelo económico y premium.
- Trazabilidad editorial vía `origin`, `review_comment`, `author_id` — sin tabla de auditoría separada.
- Menor complejidad operativa que el diseño de microservicios de v1: un solo proceso Express, un solo despliegue, sin runbooks de broker/DLQ.

Negativas:
- Sin fallback automático entre proveedores de IA todavía (a diferencia de lo que ofrecería Hermes/Nous Portal nativamente) — mitigado manualmente por ahora, ver [`../ia/runbook-incidentes.md`](../ia/runbook-incidentes.md).
- Sin cola de eventos, el reprocesamiento ante fallos depende de que cada cron vuelva a consultar por `status` — funciona al volumen actual, podría no escalar si el volumen de temas/propuestas crece mucho (no es un problema hoy).

## Criterios de éxito

- Publicación confiable con supervisión humana (`director` aprueba el 100% de lo publicado).
- Reducción del costo medio por propuesta sin deterioro de calidad editorial.
- El pipeline (`listening → content-engine → editorial → distribution`) opera de punta a punta sin intervención manual salvo la aprobación editorial en sí.
