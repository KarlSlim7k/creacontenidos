# Listening

Capa 1: `GET /api/listening/topics` sirve la pantalla RADAR (solo lectura). `POST /api/listening/topics/detect` corre la detección real vía Perplexity Sonar Pro (`PERPLEXITY_API_KEY`) y guarda los topics en la tabla `topics` — no queda en seed, es un botón real en el panel.

## Verificación editorial (Fase 1+)

Campos en `topics` (migración `034_extend_topics_verification.sql`), independientes del workflow `status` (`Nuevo` | `Revisado`):

| Campo | Notas |
|-------|--------|
| `confidence` | 0–100 o null (sin evaluar; topics legacy) |
| `verification_status` | `verified` \| `checking` \| `signal` \| `risk` \| null |
| `known_facts` / `unknown_facts` | Texto de ficha |
| `evidence` | JSONB array `{ label, url?, kind?, supports?, reliable? }` |
| `risk_flags` | JSONB array (strings o `{ code, message }`) |
| `editorial_decision` | Sugerencia editorial |
| `source_count` | Fuentes independientes contadas |

`GET /topics` acepta opcional `?verification_status=`. Plan: `docs/ia/radar-verificacion-plan.md`.

**Fase 2 (scoring en detección):** `detectTopics` / `detectTopicsFromMarkdown` / `enrichFacebookTopics` piden ficha de verificación al modelo. `lib/topic-verification.js` normaliza (clamp, cap de `verified` sin primaria/multi-fuente, hard risk → `risk`). `insertTopicIfNew` en `topic-detection.js` lo usa para web/cron y Facebook.

**Fase 3 (multi-fuente / agenda):**
- `applyScrapeMultiSource`: si evidence cita ≥2 URLs del scrape Firecrawl → sube `source_count` y +10 `confidence`.
- `source_count` también se eleva por hosts/labels independientes en evidence.
- Dedupe 24h: título exacto **o** `similarity(title) > 0.45` (pg_trgm). Si el nuevo es **mejor** (status/confidence), hace **UPDATE** (merge de evidence); si no, se descarta.

**Fase 4 (lista de fuentes):** tabla `radar_sources` (`domain`, `label`, `trust` high|medium|low, `active`).
- `GET/POST/PATCH /api/listening/radar-sources`, `DELETE` solo director.
- En detección: `applyTrustFromSources` — host high +8 conf, medium +2, low −12 + flag `low_trust_source`; solo-low no queda `verified`.

**Fase 6 (calibración):** `GET /api/listening/radar-stats?days=7|30` — distribución de `verification_status`, gate risk, detecciones, fuentes, hints. UI en RADAR → Temas. Doc: `docs/ia/radar-calibracion.md`.

El tab Competencia usa `POST /competitors/detect` sobre la tabla `competitor_posts`, con `GET/PATCH/DELETE /competitors`. Dos fuentes disponibles vía el campo `source` en el body:

- **`source: 'perplexity'` (default)**: Perplexity Sonar busca publicaciones recientes de los competidores (config: `DEFAULT_COMPETITORS` o body `{ competitors: [...] }`). Requiere `PERPLEXITY_API_KEY`.
- **`source: 'facebook'` (opt-in)**: delega al microservicio `apps/competitor-scraper/` (Playwright + cookies de sesión). Body puede traer `{ accounts: [...] }` (handles o URLs de Facebook); si se omite usa `DEFAULT_FACEBOOK_ACCOUNTS` (placeholder en código, ajustar a competidores reales). Requiere `COMPETITOR_SCRAPER_URL` apuntando al servicio; sin él responde `503 competitor_scraper_not_configured`.

Cualquier valor distinto → `400 unknown source`. Auth: `requireAuth + requireRole('director', 'produccion')` en ambos branches. El INSERT a `competitor_posts` (con dedupe por `post_url`) es compartido y se hace del lado de la API.

Además, el branch `facebook` alimenta RADAR-Temas: con los posts recién insertados, `enrichFacebookTopics` (ai-client.js) genera temas (mismos campos que `topics/detect`: antecedentes/actores/angulos/audiencia) y los inserta en `topics` con `source='Facebook'` — así el chip `Facebook` del tab Temas deja de estar vacío. `mentions` se calcula en código (reactions+comments+shares reales del post), no se le pide a la IA. Es best-effort: si falla, el scrape de `competitor_posts` ya quedó guardado y la respuesta HTTP no falla por eso (se loguea `radar_detect_fb` con status `fallo`).

Spec original: [`docs/ia/especificacion-pipeline.md`](../../../../../docs/ia/especificacion-pipeline.md).
Detalle del scraper: [`apps/competitor-scraper/README.md`](../../../competitor-scraper/README.md).
