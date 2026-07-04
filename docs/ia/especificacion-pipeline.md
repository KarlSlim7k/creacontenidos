# Especificación del pipeline — listening → content-engine → editorial → distribution

> Traduce `crea_web/PLAN_HERMES.md` §6 (specs de skills) y `docs/architecture/operating-architecture.md`
> (v1) a lo que cada módulo Express de v2 debe hacer. v1 lo implementaba como skills markdown de
> Hermes Agent sobre tablas en español (`ideas`, `piezas_contenido`, `publicaciones`); v2 lo
> implementa como cron jobs (`node-cron`) + rutas Express sobre el schema real
> (`topics`, `content_proposals`, `published_content`). No hay agente persistente, no hay
> Telegram, no hay microservicios — cada capa es un router en el mismo proceso Express, y se
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
cron every 5m  → distribution: publica en Facebook / genera link WhatsApp, guarda published_content
```

## `listening` (capa 1)

**Propósito**: detectar temas relevantes de Perote/Veracruz e insertarlos en `topics`.

**Cron**: `node-cron`, `every 6h` (registrado dentro de `apps/api/src/modules/listening`, no en `server.js` — ver skill `automation-pipeline`).

**Procedimiento**:
1. Llamar Perplexity Sonar API (`sonar-pro`) con queries de Perote/Veracruz — o el proveedor que determine [`politica-ia-y-gate-editorial.md`](./politica-ia-y-gate-editorial.md) §1.2. RSS de Google News como fuente complementaria/fallback (sin costo, útil si la key de Perplexity falla — ver [`runbook-incidentes.md`](./runbook-incidentes.md)).
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

**Cron**: `every 5m`, revisa `content_proposals WHERE status='published' AND NOT EXISTS (SELECT 1 FROM published_content WHERE proposal_id = content_proposals.id AND platform='facebook')` (evita republicar).

**Procedimiento** (Facebook, único canal en el alcance inicial — igual que v1 Fase 1/4, antes de Instagram/TikTok):
1. `POST` a Facebook Graph API (`/{page_id}/feed`) con el `title`/`body` de la propuesta.
2. `INSERT INTO published_content (proposal_id, platform, published_at, url)` con la respuesta.
3. Si falla: reintentar con backoff simple (2-3 intentos); si sigue fallando, dejarlo pendiente para el siguiente ciclo del cron — ver [`runbook-incidentes.md`](./runbook-incidentes.md) §3. No construir una dead-letter queue para este volumen.
4. `platform='web'` ya está cubierto automáticamente por `apps/api/src/modules/public` (lee `status='published'` directo) — `distribution` no necesita "publicar" al sitio, solo a redes/WhatsApp.
5. WhatsApp: en el alcance inicial es un link compartible (`https://wa.me/?text=...`) generado en el frontend/panel, no una integración de API — igual que v1 lo dejaba para fases posteriores.

## Ideas fuera de alcance (documentadas para no perderlas, no para construir ahora)

Todas existían en v1 como fases posteriores (5+) y siguen siendo válidas como roadmap, no como
trabajo pendiente inmediato:

- **Generación de imagen/audio real** (memes, infografías, cápsulas narradas): v1 usaba una cola (`assets_multimedia`) con `FOR UPDATE SKIP LOCKED` porque tenía workers separados. v2 no tiene esa tabla ni la necesita todavía — si se implementa, evaluar primero si una llamada síncrona dentro de `content-engine` alcanza antes de construir una cola.
- **Newsletter diario "Buenos días, Perote"**: sin tabla ni módulo en v2. Spec completa en `crea_web/docs/updates/CREA_Newsletter_Podcast.md` si se retoma.
- **`crea-competitor-watch`**: v2 **ya tiene la tabla** `competitor_posts` (migración `008`) pero ningún módulo la lee ni la escribe todavía — es el hueco natural para retomar esto cuando se decida scraping de competencia (Apify o similar, como en v1 Fase 6).
- **Enriquecimiento SEO (`search-intent`/`seo-review` de v1 Fase 8)**: opcional, post-lanzamiento, no bloquea nada del flujo principal.
