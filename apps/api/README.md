# CREA Command Center — API

Express 4 + pg (raw SQL) + helmet + cors + JWT/bcrypt. Postgres 15.

## Estructura

```
src/
  config/index.js         — dotenv, base URL, JWT secret
  db/
    migrate.js            — migraciones secuenciales (001–010)
    seed.js               — datos de prueba (24 artículos publicados)
    migrations/           — 001_create_users.sql … 010_create_leads.sql
  server.js               — entry point, middleware global, montaje de routers
  middleware/auth.js      — requireAuth (JWT)
  modules/
    public/               — /api/public — solo lectura publicada + POST /leads ✅
    listening/            — TODO
    content-engine/       — TODO
    editorial/            — TODO
    distribution/         — TODO
scripts/
  check-public-api.js     — verifica los 3 endpoints GET del módulo public
  check-leads.js          — verifica POST /leads (validación, honeypot, rate limit)
  verify-e2e.js           — flujo completo: portada → sección → nota → perfil → contacto
```

## Endpoints públicos

Montados en `/api/public`. Solo contenido `status='published'`. Sin auth.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/public/articles?section=&limit=&offset=` | Listado paginado (max 50) |
| GET | `/api/public/articles/:slug` | Detalle con body (404 si no publicado) |
| GET | `/api/public/authors/:name/articles` | Artículos de un autor |
| POST | `/api/public/leads` | Formulario de contacto del Estudio |

**Rate limiting:** 300 req/15min lectura, 5 req/15min POST /leads.
**CORS:** abierto en dev; en prod, definir `CORS_ORIGIN` en `.env`.

## Desarrollo

```bash
npm install
cp .env.example .env       # editar con tus llaves
npm run migrate            # crea tablas
npm run seed               # datos de prueba
npm run dev                # :3000

# Verificación
npm run check              # corre los 3 checks (API, leads, e2e)
npm run check:api          # solo API pública
npm run check:leads        # solo POST /leads
npm run check:e2e          # solo flujo end-to-end
```

## Módulos (4 capas)

Ver `src/modules/<capa>/README.md` de cada uno.
