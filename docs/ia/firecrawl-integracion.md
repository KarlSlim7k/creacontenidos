# Integración Firecrawl — CREA Command Center (RADAR / Listening)

> Documento accionable para agentes IA. Describe dónde y cómo encajar Firecrawl en la capa
> `listening` de v2. Complementa [`especificacion-pipeline.md`](./especificacion-pipeline.md)
> y [`stack-ia-servicios-costos.md`](./stack-ia-servicios-costos.md).
>
> Estado: **no implementado**. Plan de diseño + puntos de integración exactos (auditados contra el código).
> Implementación en **3 fases** secuenciales (commit tras cada una, según workflow del proyecto).

## Resumen para agentes

- Firecrawl **NO reemplaza** al scraper de Facebook (`apps/competitor-scraper/`). FB requiere
  sesión/cookies reales y JS pesado; Firecrawl no los cubre bien. Ambos son complementarios.
- Firecrawl entra solo en la capa **web pública** de RADAR: scrapear sitios locales/municipales/
  competencia, obtener markdown limpio y clasificar temas con `chatComplete` (Nous Portal).
  Así se reduce (o elimina) el uso de Perplexity Sonar Pro en `detectTopics`.
- FB sigue alimentando `topics` con `source='Facebook'` vía
  `POST /api/listening/competitors/detect` (`source: 'facebook'`) +
  `generateTopicsFromFacebookPosts` / `enrichFacebookTopics`. Fuera del alcance de Firecrawl.
- Plan contratado: **Free = 1000 créditos/mes**. Volumen estimado ~600–800/mes.

## Flujo actual (antes de Firecrawl)

```
Cron 6h (lib/listening-cron.js)  ─┐
POST /api/listening/topics/detect ─┴→ detectAndSaveTopics(query, userId, trigger)
                                        → ai-client.detectTopics(query)
                                          → perplexitySearch (modelo sonar-pro fijo)
                                        → dedupe 24h por lower(title)
                                        → INSERT topics (source default 'Web Search')
                                        → logActivity: radar_detect | radar_detect_auto
```

Rama FB (independiente, no tocar):

```
POST /api/listening/competitors/detect { source: 'facebook' }
  → COMPETITOR_SCRAPER_URL (Playwright + cookies)
  → INSERT competitor_posts (source_platform='facebook')
  → generateTopicsFromFacebookPosts → topics source='Facebook'
  → log radar_detect_fb
```

`competitors/detect` con `source: 'perplexity'` (default) escribe en **`competitor_posts`**,
no en `topics`. No confundir con la detección de temas de RADAR.

## Puntos de integración en el código (rutas exactas)

| Qué | Dónde tocar |
|---|---|
| Detección de temas web (hoy Perplexity) | `apps/api/src/lib/topic-detection.js` → `detectAndSaveTopics()` → `apps/api/src/lib/ai-client.js` `detectTopics()` → `perplexitySearch` (modelo `sonar-pro` hardcodeado) |
| Clasificación LLM post-scrape | `apps/api/src/lib/ai-client.js` → `chatComplete` (**solo Nous Portal**; no hay path Anthropic/OpenAI directo en este cliente) |
| Endpoint manual | `POST /api/listening/topics/detect` en `apps/api/src/modules/listening/index.js` (`requireAuth` + `requireRole('director','produccion')`) |
| Cron automático (6h, America/Mexico_City) | `apps/api/src/lib/listening-cron.js` (registrado desde `apps/api/src/server.js` → `startListeningCron()`). Log éxito: `radar_detect_auto` |
| Tabla destino | `topics`. Base: migración `002_create_topics.sql`. Ficha RADAR: `013_extend_topics_for_radar.sql` (`antecedentes, actores, angulos, audiencia`). Status locale: `023_fix_topics_status_locale.sql` → default **`'Nuevo'`** (no `'new'`) |
| Dedupe real | `SELECT id FROM topics WHERE lower(title) = lower($1) AND detected_at >= now() - interval '24 hours'` luego `continue` si hay filas. Case-insensitive, ventana 24h. **No** es `WHERE NOT EXISTS` ni title exacto |
| Source al insertar (web hoy) | `topic.source \|\| 'Web Search'` en `topic-detection.js` |
| Source FB | `'Facebook'` hardcodeado en `generateTopicsFromFacebookPosts` |
| Env vars | Root `.env.example` y `apps/api/.env.example`. Agregar `FIRECRAWL_API_KEY` (y opcional `FIRECRAWL_BASE_URL`). Leer en `apps/api/src/config/index.js` (patrón de `competitorScraperUrl` / keys de IA) |
| UI RADAR | `apps/admin/assets/js/radar.js` — chips: `['Todas','Perplexity','Facebook','TikTok']`. El filtro es igualdad exacta (`r.source === state.radarSource`). Hoy la detección real guarda `'Web Search'`, no `'Perplexity'`, así que el chip **no matchea** producción. `'TikTok'` solo aparece en seed (`003_admin_seed.sql`), no hay productor real |
| Lista de competencia (nombres, no URLs) | `DEFAULT_COMPETITORS = ['Diario de Xalapa', 'AVC Noticias', 'El Dictamen']` en `listening/index.js`. Se usa solo en `competitors/detect` + Perplexity (`detectCompetitorPosts`). **No son URLs scrapables** |
| Cuentas FB | Tabla `competitor_facebook_accounts` (migración 031). No usar como input de Firecrawl |

## Diseño propuesto (mínimo, sin sobre-ingeniería)

### Decisión de alcance (recomendada)

Firecrawl **reemplaza Perplexity solo en la detección web de topics** (`detectAndSaveTopics` /
`detectTopics`). Fallback a Perplexity si Firecrawl no está configurado o falla.

**No** usar Firecrawl en:
- `competitors/detect` `source: 'facebook'` (scraper propio).
- `competitors/detect` `source: 'perplexity'` (sigue siendo watch de posts vía Sonar; opcional
  dejarlo; es otro producto: `competitor_posts`, no `topics`).

### Source a guardar

Recomendado: mantener **`source='Web Search'`** para topics web (Firecrawl o Perplexity fallback).
Un solo chip de UI cubre ambos orígenes; el log de actividad ya distingue modelo/proveedor vía
`logActivity` metadata.

No introducir `source='Firecrawl'` salvo que se necesite auditar origen en UI. Si se introduce,
hay que añadir el chip correspondiente.

### No tocar en ninguna fase

- `apps/competitor-scraper/`
- Branch `source: 'facebook'` de `competitors/detect`
- `enrichFacebookTopics` / `generateTopicsFromFacebookPosts`
- Frecuencia del cron (sigue 6h); solo cambia el origen del texto de entrada cuando Firecrawl
  está activo.

---

## Fases de implementación

Implementar en orden. **Commit al cerrar cada fase.** No mezclar fases en un solo commit.

### Fase 1 — Cliente Firecrawl + env/config

Objetivo: poder scrapear markdown desde el API sin cambiar aún el flujo de topics.

| Entrega | Detalle |
|---|---|
| Cliente | `apps/api/src/lib/firecrawl-client.js` con `scrapeMarkdown(url, opts)` → `POST {base}/scrape` |
| Auth | `Authorization: Bearer ${FIRECRAWL_API_KEY}` |
| Base URL | `FIRECRAWL_BASE_URL` o default `https://api.firecrawl.dev/v1` |
| Resiliencia | Timeout + 1 reintento; sin key → error `firecrawl_not_configured` (mismo estilo que `competitor_scraper_not_configured`) |
| Env | `FIRECRAWL_API_KEY`, opcional `FIRECRAWL_BASE_URL`, opcional `FIRECRAWL_SOURCE_URLS` (CSV) en root `.env.example` y `apps/api/.env.example` |
| Config | Exponer en `apps/api/src/config/index.js`: `firecrawlApiKey`, `firecrawlBaseUrl`, `firecrawlSourceUrls` |
| URLs de fuentes | Lista nueva (constante o env). **No** reutilizar `DEFAULT_COMPETITORS` (son nombres, no URLs). 4–6 URLs públicas locales/municipales/regionales — **definirlas al implementar** (hoy no existen en el repo) |

Fuera de Fase 1: no enganchar aún a `topic-detection.js`; no tocar UI.

**Criterio de cierre:** con key real, una llamada manual/unitaria a `scrapeMarkdown(url)` devuelve markdown; sin key, error claro. Commit Fase 1.

---

### Fase 2 — Rama en `topic-detection` + fallback Perplexity

Objetivo: detección web de topics usa Firecrawl + `chatComplete` cuando hay key y URLs; si no, el camino actual.

Flujo objetivo de `detectAndSaveTopics(query, userId, trigger)`:

```
1. Si FIRECRAWL_API_KEY y hay URLs de fuentes:
     scrapeMarkdown(cada URL) → concatenar/recortar markdown
     chatComplete(prompt tipo detectTopics, markdown como contexto)
     parsear JSON de topics (title, source, mentions, sentiment,
       antecedentes, actores, angulos, audiencia; máx. 5)
2. Si falla o no hay key: fallback detectTopics(query)  // Perplexity sonar-pro actual
3. Dedupe 24h lower(title)  // query SQL existente, sin cambios
4. INSERT sin setear status  // default BD = 'Nuevo'
5. logActivity con metadata { provider: 'firecrawl'|'perplexity', model, usage, count }
```

| Entrega | Detalle |
|---|---|
| Enganche | Solo `apps/api/src/lib/topic-detection.js` (+ helpers mínimos en `ai-client.js` si hace falta reutilizar el shape del prompt de `detectTopics`) |
| Clasificación | `chatComplete` (Nous + `AI_MODEL_*`). **No** Anthropic/OpenAI directo |
| Source INSERT | `'Web Search'` (recomendado) tanto para Firecrawl como para fallback Perplexity |
| Dedupe / status | Conservar comportamiento actual |
| Metadata | `provider` en `logActivity` para auditar gasto sin cambiar `source` en BD |

Opcional posterior (no bloquea Fase 2): `extract(urls, schema)` en el cliente Firecrawl (`POST {base}/extract`, 1–2 créditos) si scrape+chatComplete no basta.

**Criterio de cierre:** con Firecrawl configurado, `POST /api/listening/topics/detect` inserta topics vía scrape+Nous; sin key o ante fallo, sigue funcionando con Perplexity. Dedupe 24h intacto. Commit Fase 2.

---

### Fase 3 — Chips UI + smoke test + cupo

Objetivo: el panel RADAR filtra con los `source` reales y el flujo queda verificado en uso.

| Entrega | Detalle |
|---|---|
| UI | `apps/admin/assets/js/radar.js` — chips alineados a BD: `['Todas', 'Web Search', 'Facebook']`. Quitar o alinear `Perplexity`/`TikTok` (TikTok solo si hay productor real; hoy solo seed) |
| Filtro | El valor del chip **debe** ser el string en BD (`Web Search`), no el nombre del proveedor. Igualdad exacta actual (`r.source === state.radarSource`) |
| Smoke | `POST /api/listening/topics/detect` con rol `director` o `produccion`; verificar filas en `topics`, dedupe 24h y chip UI |
| Cupo | Tras 1–2 días de cron, medir créditos Firecrawl. Si se acerca a 1000/mes: cachear markdown por URL/día o bajar frecuencia de scrape (cron puede seguir 6h reusando markdown reciente) |

**Criterio de cierre:** chip “Web Search” muestra topics reales; “Facebook” sigue filtrando FB; smoke manual OK. Commit Fase 3.

---

## Costos y créditos (plan Free 1000/mes)

1 crédito ≈ 1 página scrape básica; `/extract` (LLM) ≈ 1–2 créditos.
La clasificación con `chatComplete` (Nous) **no** consume créditos Firecrawl; sí tokens Nous
(ya presupuestados en el stack de IA).

| Ítem | Frecuencia | Créditos Firecrawl/mes |
|---|---|---|
| 5 sitios scrape 1×/día | 30 días | ~150 |
| Artículos/links extra ~10 págs/día (si se sigue a detalle) | 30 días | ~300 |
| Picos eventuales | — | ~150 |
| **Total estimado** | | **~600–800** |

Entra en los 1000 del Free. Si el cron corre cada 6h sobre las mismas 5 URLs:
`5 URLs × 4 corridas/día × 30 ≈ 600` solo en scrape — vigilar para no saturar el cupo;
cachear por URL/día o bajar frecuencia de scrape (p. ej. 1×/día) y dejar el cron 6h con
reuso de markdown reciente si hace falta.

**Ahorro de IA**: desplaza ~$1–15/mes de Perplexity Sonar (orden de magnitud de
`stack-ia-servicios-costos.md`) hacia Firecrawl Free + tokens Nous ya existentes.
El scraper de FB no cambia de costo (RAM del contenedor; sin fee por corrida).

## Requisitos para probar (lo que falta)

- Cuenta Free Firecrawl + `FIRECRAWL_API_KEY` en `.env`.
- Definir la lista real de URLs públicas a scrapear (no usar `DEFAULT_COMPETITORS`).
- Decisión de source en BD: **`Web Search`** (recomendada) vs `Firecrawl`.
- Fallback Perplexity: requiere `PERPLEXITY_API_KEY` como hoy.
- Clasificación: `NOUS_PORTAL_API_KEY` + `AI_MODEL_DEFAULT` (o el modelo que use `chatComplete`).
- RADAR FB (independiente de este plan): `COMPETITOR_SCRAPER_URL` + cookies válidas en el
  microservicio + `POST /api/listening/competitors/detect` con `source: 'facebook'`.

## Checklist de implementación (para agente)

### Fase 1 — Cliente + config
- [ ] Crear `apps/api/src/lib/firecrawl-client.js` (`scrapeMarkdown`; timeout + reintento; error si no hay key).
- [ ] Agregar `FIRECRAWL_API_KEY` (+ opcional `FIRECRAWL_BASE_URL`, `FIRECRAWL_SOURCE_URLS`) a
      `.env.example` (root y/o `apps/api`) y a `apps/api/src/config/index.js`.
- [ ] Definir lista de URLs de fuentes web (constante o env). **No** reutilizar `DEFAULT_COMPETITORS`.
- [ ] Commit Fase 1.

### Fase 2 — Detección web
- [ ] En `topic-detection.js`: rama Firecrawl → markdown → `chatComplete` → mismos campos de topic;
      fallback a `detectTopics` (Perplexity) si falla o no hay key.
- [ ] Conservar dedupe actual: `lower(title)` + ventana 24h. No insertar `status` a mano (default `'Nuevo'`).
- [ ] `source` web: `'Web Search'` (recomendado) en el INSERT.
- [ ] `logActivity`: incluir `provider` (`firecrawl`|`perplexity`) y usage/modelo en metadata.
- [ ] No modificar `apps/competitor-scraper/` ni el branch facebook de `competitors/detect`.
- [ ] Commit Fase 2.

### Fase 3 — UI + verificación
- [ ] Corregir chips en `apps/admin/assets/js/radar.js` para que el filtro matchee sources reales
      (`Web Search`, `Facebook`; quitar o alinear `Perplexity`/`TikTok` según productor real).
- [ ] Smoke test: `POST /api/listening/topics/detect` con rol `director` o `produccion`; verificar
      filas en `topics`, dedupe 24h y chip de UI.
- [ ] Medir créditos Firecrawl tras 1–2 días de cron y ajustar frecuencia/URLs si se acerca a 1000/mes.
- [ ] Commit Fase 3.

## Anti-patrones (no hacer)

- No scrapear Facebook con Firecrawl.
- No tratar `DEFAULT_COMPETITORS` como URLs.
- No setear `status='new'` (el locale real es `'Nuevo'`).
- No apuntar el cron a `modules/listening/listening-cron.js` — el archivo real es
  `apps/api/src/lib/listening-cron.js`.
- No llamar Anthropic/OpenAI directo para clasificar: usar `chatComplete` (Nous).
- No escribir `source='Perplexity'` en BD solo para cuadrar el chip; corregir el chip.
- No mezclar este flujo con inserts a `competitor_posts` (eso es el watch de competencia).
