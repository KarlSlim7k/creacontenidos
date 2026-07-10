# CREA Command Center

Sistema de automatización editorial de CREA Contenidos (Perote, Veracruz).

## Arquitectura

4 capas en secuencia, implementadas como módulos en `apps/api/src/modules/`:

1. **Listening** — cron jobs que consultan Perplexity Sonar API y/o el microservicio `apps/competitor-scraper/` (Playwright + cookies de Facebook) para detectar temas relevantes en Perote y publicaciones de competidores.
2. **Content Engine** — genera propuestas (nota, post, guion de audio, guion de video, meme) con Claude API.
3. **Editorial** — API del panel donde se revisa, edita, aprueba o rechaza cada propuesta. Nada se publica sin aprobación humana.
4. **Distribution** — publica el contenido aprobado (Facebook, sitio, WhatsApp) y guarda métricas.

## Estructura

```
apps/
  web/                 frontend público (portal + /estudio)
  admin/               frontend del panel administrativo
  api/                 backend Node.js + Express
  competitor-scraper/  microservicio HTTP (Playwright + Chromium) — self-hosted en la red de Dokploy
docs/                  brief, especificación y demás documentos del proyecto
docker-compose.yml     Postgres + api + competitor-scraper para desarrollo local
```

## API pública

El módulo `apps/api/src/modules/public/` expone contenido de solo lectura con `status='published'`
y el formulario de contacto del Estudio. Montado en `/api/public`:

| Endpoint | Descripción |
|---|---|
| `GET /api/public/articles?section=&limit=&offset=` | Listado de artículos publicados |
| `GET /api/public/articles/:slug` | Detalle de artículo por slug (404 si no publicado) |
| `GET /api/public/authors/:name/articles` | Artículos de un autor |
| `POST /api/public/leads` | Formulario de contacto del Estudio |

**Rate limiting:** 300 req/15min en toda la superficie de lectura; 5 req/15min en POST /leads.
**CORS:** abierto en desarrollo (portal :4000 → API :3000). En producción, definir `CORS_ORIGIN` en `.env`.

### Competitor scraper

`apps/competitor-scraper/` es un microservicio HTTP (`POST /scrape`, `GET /health`) que
scrapea páginas de Facebook usando Playwright + Chromium y las cookies de sesión del
usuario. Vive en la red interna de Dokploy (no expuesto al público). El API lo invoca
vía `POST /api/listening/competitors/detect` cuando el body trae `source: 'facebook'`
(default: `perplexity`). Detalle: `apps/competitor-scraper/README.md`.

### Checks

Detalle de la suite (grupos, variables, cómo agregar uno nuevo): `docs/implementaciones/testing-api.md`.

```bash
npm run check                          # los 9 checks secuenciales (alias de test:all)
npm run check:api                      # listado, slug, autor, gate editorial, 429
npm run check:leads                    # validación, inserción, honeypot, 429 estricto
npm run check:e2e                      # flujo portada→sección→nota→perfil→contacto
npm run check:admin                    # auth por rol, ideas, comercial, RADAR, leads, competencia, métricas
npm run check:social                   # embed HTML, XSS, gate editorial
npm run check:content                  # content-engine: auth, status, rate limit
npm run check:newsletter               # newsletter: cron lock, doble opt-in, idempotencia
npm run check:nota-ssr                 # SSR de nota.html con Open Graph
npm run check:scraper                  # branch de Facebook en competitors/detect (requiere scraper-stub)
```

## Desarrollo local

```bash
# 1. Levantar Postgres (docker compose o podman)
docker compose up -d
# o: podman run -d --name crea-db -e POSTGRES_USER=crea -e POSTGRES_PASSWORD=crea_dev -e POSTGRES_DB=crea_command_center -p 5432:5432 postgres:15

# 2. Backend
cd apps/api
cp .env.example .env   # completar con tus llaves
npm install
npm run migrate
npm run seed
npm run dev             # http://localhost:3000/health
npm run check           # verificar que todo funciona

# 3. Competitor scraper (opcional, solo si vas a usar source: 'facebook')
cd apps/competitor-scraper
npm install
npm test                # 22 tests sin Playwright
# Opcional: poner cookies.txt en la raíz para habilitar login scraping
docker build -t competitor-scraper .
docker run --rm -d --name scraper-dev -p 3015:3015 \
  -v "$(pwd)/cookies.txt:/secrets/fb_cookies.txt:ro" \
  -e FB_COOKIES_FILE=/secrets/fb_cookies.txt competitor-scraper

# 4. Frontends (estáticos, sin build)
npx serve apps/web -l 4000    # respeta apps/web/serve.json (cleanUrls off: nota.html?slug= y perfil.html?autor= necesitan el querystring)
npx serve apps/admin -l 4001
```

Ningún módulo de IA (Perplexity, Claude, OpenAI) está conectado todavía — solo el esqueleto de arquitectura con datos de prueba. El competitor scraper funciona contra Facebook con cookies reales (ver `apps/competitor-scraper/README.md` para rotación).
