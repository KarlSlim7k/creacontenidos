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

## Desarrollo local

```bash
# 1. Levantar Postgres
docker compose up -d

# 2. Backend
cd apps/api
cp .env.example .env   # completar con tus llaves
npm install
npm run migrate
npm run seed
npm run dev             # http://localhost:3000/health

# 3. Frontends (estáticos, sin build)
npx serve apps/web -l 4000
npx serve apps/admin -l 4001
```

Ningún módulo de IA (Perplexity, Claude, OpenAI, Apify) está conectado todavía — solo el esqueleto de arquitectura con datos de prueba.
