# Listening

Capa 1: `GET /api/listening/topics` sirve la pantalla RADAR (solo lectura). `POST /api/listening/topics/detect` corre la detección real vía Perplexity Sonar Pro (`PERPLEXITY_API_KEY`) y guarda los topics en la tabla `topics` — no queda en seed, es un botón real en el panel.

El tab Competencia usa `POST /competitors/detect` sobre la tabla `competitor_posts`, con `GET/PATCH/DELETE /competitors`. Dos fuentes disponibles vía el campo `source` en el body:

- **`source: 'perplexity'` (default)**: Perplexity Sonar busca publicaciones recientes de los competidores (config: `DEFAULT_COMPETITORS` o body `{ competitors: [...] }`). Requiere `PERPLEXITY_API_KEY`.
- **`source: 'facebook'` (opt-in)**: delega al microservicio `apps/competitor-scraper/` (Playwright + cookies de sesión). Body puede traer `{ accounts: [...] }` (handles o URLs de Facebook); si se omite usa `DEFAULT_FACEBOOK_ACCOUNTS` (placeholder en código, ajustar a competidores reales). Requiere `COMPETITOR_SCRAPER_URL` apuntando al servicio; sin él responde `503 competitor_scraper_not_configured`.

Cualquier valor distinto → `400 unknown source`. Auth: `requireAuth + requireRole('director', 'produccion')` en ambos branches. El INSERT a `competitor_posts` (con dedupe por `post_url`) es compartido y se hace del lado de la API.

Además, el branch `facebook` alimenta RADAR-Temas: con los posts recién insertados, `enrichFacebookTopics` (ai-client.js) genera temas (mismos campos que `topics/detect`: antecedentes/actores/angulos/audiencia) y los inserta en `topics` con `source='Facebook'` — así el chip `Facebook` del tab Temas deja de estar vacío. `mentions` se calcula en código (reactions+comments+shares reales del post), no se le pide a la IA. Es best-effort: si falla, el scrape de `competitor_posts` ya quedó guardado y la respuesta HTTP no falla por eso (se loguea `radar_detect_fb` con status `fallo`).

Spec original: [`docs/ia/especificacion-pipeline.md`](../../../../../docs/ia/especificacion-pipeline.md).
Detalle del scraper: [`apps/competitor-scraper/README.md`](../../../competitor-scraper/README.md).
