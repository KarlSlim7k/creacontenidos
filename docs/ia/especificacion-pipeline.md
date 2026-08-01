# Especificación del pipeline — listening → content-engine → editorial → distribution

> Traduce `crea_web/PLAN_HERMES.md` §6 (specs de skills) y `docs/architecture/operating-architecture.md`
> (v1) a lo que cada módulo Express de v2 debe hacer. v1 lo implementaba como skills markdown de
> Hermes Agent sobre tablas en español (`ideas`, `piezas_contenido`, `publicaciones`); v2 lo
> implementa como cron jobs (`node-cron`) + rutas Express sobre el schema real
> (`topics`, `content_proposals`, `published_content`). No hay agente persistente ni broker de
> eventos; Telegram y el scraper de Facebook son integraciones acotadas. Cada capa principal es un router en el mismo proceso Express y se
> comunican leyendo/escribiendo las tablas compartidas (ver skill `automation-pipeline`).

## Flujo end-to-end

```
cron every 6h  → listening: detecta temas → INSERT topics (status='new')
                       ↓
cron / trigger → content-engine: por cada topic nuevo, genera 1 propuesta por formato
                       ↓ INSERT content_proposals (status='propuesta')
                       ↓
panel admin    → editorial: aprobar/rechazar/editar/publicar (YA IMPLEMENTADO)
                       ↓ UPDATE content_proposals (status='published')
                       ↓
apps/web/public → lee status='published' (YA IMPLEMENTADO, Fase 1 de PLAN_v1.md)
                       ↓
panel admin    → distribution: publica en canales externos y guarda cada intento en published_content
```

## `listening` (capa 1)

**Propósito**: detectar temas relevantes de Perote/Veracruz e insertarlos en `topics`.

**Cron**: `node-cron`, `every 6h` (registrado dentro de `apps/api/src/modules/listening`, no en `server.js` — ver skill `automation-pipeline`).

**Procedimiento**:
1. Si existen `FIRECRAWL_API_KEY` y `FIRECRAWL_SOURCE_URLS`, obtener markdown público con Firecrawl y clasificarlo con Nous. Si esa ruta no está configurada o falla, usar Perplexity Sonar (`sonar-pro`) como fallback — ver [`runbook-incidentes.md`](./runbook-incidentes.md).
2. Clasificar sentimiento (`sentiment`) con el modelo económico de la política de ruteo.
3. **Deduplicar antes de insertar** — es la regla no negociable de `automation-pipeline`: un cron debe ser idempotente. v1 dedupeaba contra el título de los últimos 14 días; en v2, dado que `topics` no tiene columna `source_url` ni constraint único, dedupear por `title` exacto o similitud simple contra `topics` de los últimos N días antes de insertar (`WHERE NOT EXISTS (...)`, mismo patrón que `apps/api/src/db/seeds/001_dev_seed.sql`).
4. `INSERT INTO topics (title, source, mentions, sentiment, status) VALUES (..., 'new')`.
5. Opcional, para alimentar la pantalla RADAR del panel (`GET /api/listening/topics`, ya implementado): poblar `antecedentes`, `actores`, `angulos`, `audiencia` (migración `013`) con una llamada adicional de contexto — no obligatorio para el flujo mínimo.
6. Limpieza: no hay política de retención implementada; si `topics` crece sin control, considerar un `status='archived'` o borrado de filas `status='new'` con más de 30 días sin revisar — no construir esto hasta que sea un problema real.

**No** implementar: cola de eventos, broker, ni tabla de deduplicación separada — el `WHERE NOT EXISTS` contra `topics` alcanza al volumen de este proyecto.

## `content-engine` (capa 2)

**Propósito**: por cada `topic` con `status='new'`, generar una propuesta por formato en `content_proposals`.

**Disparo**: cron encadenado ~30 min después de `listening` (mismo patrón que v1: radar → espera → generación), o disparo manual desde el panel si un `director` quiere regenerar antes.

**Procedimiento**:
1. `SELECT * FROM topics WHERE status = 'new' LIMIT N` (empezar con un lote pequeño, p. ej. 3 temas por ciclo — mismo límite que usaba v1).
2. Por cada tema, una llamada a Claude API con el system prompt de [`identidad-editorial.md`](./identidad-editorial.md), pidiendo las 5 propuestas (`nota`, `post`, `guion_audio`, `guion_video`, `meme`) — v1 usaba subagentes paralelos (`delegate_task`) porque Hermes lo soporta nativamente; en Node, `Promise.all` de 5 llamadas (o 1 sola llamada que devuelva un array JSON con los 5) es equivalente y no necesita esa infraestructura.
3. Por cada formato devuelto: `INSERT INTO content_proposals (topic_id, format, title, body, dek, image_prompt, angulo, status) VALUES (..., 'propuesta')`.
4. `UPDATE topics SET status = 'reviewed' WHERE id = $1` (evita que el mismo tema se vuelva a procesar en el siguiente ciclo).

**Manejo de errores**: si la llamada al modelo falla para un tema, dejarlo con `status='new'` (se reintenta en el siguiente ciclo) — no marcarlo como fallido permanentemente sin necesidad.

## `editorial` (capa 3) — ya implementado

Ver [`politica-ia-y-gate-editorial.md`](./politica-ia-y-gate-editorial.md) §2.1 para el estado real. No hay trabajo pendiente de "spec" aquí — los gaps documentados (doble aprobación por `sensibilidad`, trazabilidad de modelo/tokens) son mejoras opcionales, no bloqueantes para que `listening`/`content-engine` empiecen a alimentar la bandeja.

## `distribution` (capa 4)

**Propósito**: publicar `content_proposals` con `status='published'` en canales externos y registrar el resultado en `published_content`.

**Disparo**: manual desde el panel, mediante rutas `POST` protegidas para rol `director`. No existe cron de distribución.

**Procedimiento**:
1. Elegir Facebook, WhatsApp o WordPress desde el panel. Facebook usa Graph API; WhatsApp devuelve un enlace compartible; WordPress usa su REST API.
2. `INSERT INTO published_content` con plataforma, estado, detalle y URL cuando exista. Los intentos fallidos también se registran.
3. Si falla, corregir la causa y reintentar manualmente — ver [`runbook-incidentes.md`](./runbook-incidentes.md) §5. No construir una cola ni reintentos automáticos para este volumen.
4. `platform='web'` ya está cubierto automáticamente por `apps/api/src/modules/public` (lee `status='published'` directo) — `distribution` no necesita "publicar" al sitio, solo a redes/WhatsApp.
5. WhatsApp es un link compartible (`https://wa.me/?text=...`), no una integración de Business API.

## Ideas fuera de alcance (documentadas para no perderlas, no para construir ahora)

Todas existían en v1 como fases posteriores (5+) y siguen siendo válidas como roadmap, no como
trabajo pendiente inmediato:

- **Generación de imagen/audio real** (memes, infografías, cápsulas narradas): v1 usaba una cola (`assets_multimedia`) con `FOR UPDATE SKIP LOCKED` porque tenía workers separados. v2 no tiene esa tabla ni la necesita todavía — si se implementa, evaluar primero si una llamada síncrona dentro de `content-engine` alcanza antes de construir una cola.
- **Newsletter diario "Buenos días, Perote"**: sin tabla ni módulo en v2. Spec completa en `crea_web/docs/updates/CREA_Newsletter_Podcast.md` si se retoma.
- **`crea-competitor-watch`** (✅ integrado julio 2026): v2 ya tiene la tabla `competitor_posts` (migración 008) y dos fuentes que la alimentan vía `POST /api/listening/competitors/detect` con campo `source` en el body:
  - `source: 'perplexity'` (default) — Perplexity Sonar busca publicaciones recientes de los medios configurados en `DEFAULT_COMPETITORS` o por body.
  - `source: 'facebook'` — delega al microservicio self-hosted `apps/competitor-scraper/` (Playwright + cookies de sesión). Requiere `COMPETITOR_SCRAPER_URL` apuntando al servicio; sin él responde `503 competitor_scraper_not_configured`. Body trae `accounts` (handles/URLs de Facebook).
  - El INSERT a `competitor_posts` con dedupe por `post_url` es compartido y vive en el handler de la API, no en el scraper. Detalle operativo: `apps/competitor-scraper/README.md` y `apps/api/src/modules/listening/README.md`.
- **Enriquecimiento SEO (`search-intent`/`seo-review` de v1 Fase 8)**: opcional, post-lanzamiento, no bloquea nada del flujo principal.
