# Listening

Capa 1: `GET /api/listening/topics` sirve la pantalla RADAR (solo lectura). `POST /api/listening/topics/detect` corre la detección real vía Nous Portal (`NOUS_PORTAL_API_KEY`) y guarda los topics en la tabla `topics` — no queda en seed, es un botón real en el panel. Apify (fuente adicional de social listening) sigue fuera de alcance.

Spec original: [`docs/ia/especificacion-pipeline.md`](../../../../../docs/ia/especificacion-pipeline.md).
