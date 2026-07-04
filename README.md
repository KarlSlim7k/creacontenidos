# CREA Command Center

Sistema de automatización editorial de CREA Contenidos (Perote, Veracruz).

## Arquitectura

4 capas en secuencia, implementadas como módulos en `apps/api/src/modules/`:

1. **Listening** — cron jobs que consultan Perplexity Sonar API (y más adelante Apify) para detectar temas relevantes en Perote.
2. **Content Engine** — genera propuestas (nota, post, guion de audio, guion de video, meme) con Claude API.
3. **Editorial** — API del panel donde se revisa, edita, aprueba o rechaza cada propuesta. Nada se publica sin aprobación humana.
4. **Distribution** — publica el contenido aprobado (Facebook, sitio, WhatsApp) y guarda métricas.

## Estructura

```
apps/
  web/     frontend público (portal + /estudio)
  admin/   frontend del panel administrativo
  api/     backend Node.js + Express
docs/      brief, especificación y demás documentos del proyecto
docker-compose.yml   Postgres para desarrollo local
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

### Checks

```bash
npm run check                          # los 3 checks secuenciales
npm run check:api                      # listado, slug, autor, gate editorial, 429
npm run check:leads                    # validación, inserción, honeypot, 429 estricto
npm run check:e2e                      # flujo portada→sección→nota→perfil→contacto
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

# 3. Frontends (estáticos, sin build)
npx serve apps/web -l 4000    # respeta apps/web/serve.json (cleanUrls off: nota.html?slug= y perfil.html?autor= necesitan el querystring)
npx serve apps/admin -l 4001
```

Ningún módulo de IA (Perplexity, Claude, OpenAI, Apify) está conectado todavía — solo el esqueleto de arquitectura con datos de prueba.
