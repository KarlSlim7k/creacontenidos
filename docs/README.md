# Documentación — CREA Command Center

Organizada por tema en subcarpetas:

| Carpeta | Contenido |
|---|---|
| [`ia/`](./ia/) | Stack de IA vigente, política editorial/gate, identidad de voz, runbook de incidentes, RADAR. Empezar por [`ia/README.md`](./ia/README.md). |
| [`adr/`](./adr/) | Architecture Decision Records — decisiones de arquitectura y su porqué. |
| [`implementaciones/`](./implementaciones/) | Specs y prompts usados para construir panel admin y testing de API, más las convenciones vigentes del panel ([`panel_admin_convenciones.md`](./implementaciones/panel_admin_convenciones.md)) — esas sí son reglas a respetar, no historia. |
| [`planes/`](./planes/) | Planes de desarrollo por fase (ej. [`PLAN_v1.md`](./planes/PLAN_v1.md), completado). |
| [`auditorias/`](./auditorias/) | Auditorías de seguridad/calidad puntuales — registro histórico con estado de resolución anotado en cada una, no fuente de verdad del estado actual del código. |

Para el estado real del código en cualquier momento: leer el código y `git log`, no estos documentos —
son contexto y decisiones, no espejo en vivo del repo.
