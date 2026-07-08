# Competitor Scraper — apps/competitor-scraper/

Microservicio HTTP que scrapea páginas de Facebook para alimentar la tabla
`competitor_posts` de CREA Command Center. Self-hosted en el mismo VPS que la
API, expuesto solo en la red interna de Dokploy (`expose:`, no `ports:`).

> Reemplaza al actor Apify externo. La forma anterior de scrapear Facebook
> (vía Apify Cloud) está fuera de alcance: este scraper vive en
> `apps/competitor-scraper/` y se levanta como un servicio Docker adicional
> en el mismo `docker-compose.yml`.

## Qué hace

Recibe `POST /scrape` con `{ accounts: string[], maxPostsPerAccount?: number, sinceDate?: ISO }`,
abre cada página de Facebook con Playwright (Chromium headless), autentica con
las cookies de sesión del usuario, y devuelve los posts más recientes
(formato `competitor_posts` — 1:1 con la tabla del API).

## Endpoints

| Método | Path     | Descripción                                                                                |
|--------|----------|--------------------------------------------------------------------------------------------|
| GET    | /health  | Estado + info de cookies. Usado por el healthcheck de Docker y el panel de monitoreo.      |
| POST   | /scrape  | Ejecuta el scrape. Body: `{ accounts, maxPostsPerAccount?, sinceDate? }`. Timeout 5 min.    |

Respuesta de `POST /scrape`:
```json
{
  "items": [ { "source_platform": "facebook", "source_account": "...", "post_url": "...",
               "post_text": "...", "post_date": "ISO|null", "reactions": 0, "comments": 0,
               "shares": 0, "views": 0, "media_type": "texto" } ],
  "meta":  { "count": 1, "accounts": 1, "elapsedMs": 4200 }
}
```

## Autenticación (cookies de Facebook)

El scraper necesita las **cookies de sesión de Facebook** (NO la contraseña
del usuario) para que Playwright pueda cargar el feed sin que Facebook
muestre el muro de login. Las cookies se montan como archivo `cookies.txt`
(formato Netscape, exportable con la extensión "Get cookies.txt LOCALLY"
de Brave/Chrome) en el contenedor del scraper.

### Cómo rotar las cookies

1. En Brave/Chrome, abre `https://www.facebook.com` con la sesión iniciada.
2. Click en la extensión **"Get cookies.txt LOCALLY"** → filtra por
   `facebook.com` → exporta en formato **Netscape** → guarda como
   `cookies.txt`.
3. En Dokploy, reemplaza el archivo `secrets/fb_cookies.txt` del servicio
   `competitor-scraper` con el nuevo export.
4. Reinicia el servicio: `docker compose restart competitor-scraper`.
5. Llama al endpoint una vez y verifica en logs `Session check OK` — si
   dice `Session check FAILED` las cookies vencieron y hay que repetir.

Las cookies expiran cada 30-90 días. Si ves muchos `Login wall detected` en
los logs, es hora de rotar.

## Configuración (env vars)

| Variable           | Default | Descripción                                                                                       |
|--------------------|---------|---------------------------------------------------------------------------------------------------|
| `PORT`             | 3015    | Puerto del servidor HTTP. Solo accesible dentro de la red de Dokploy.                              |
| `FB_COOKIES_FILE`  | —       | Path al archivo de cookies (montado como volume). Ej: `/secrets/fb_cookies.txt`.                  |
| `FB_COOKIES`       | —       | Alternativa: cookies en string (JSON/Netscape/shorthand). Tiene prioridad sobre `FB_COOKIES_FILE`. |
| `SCRAPE_TIMEOUT_MS`| 300000  | Timeout (5 min) por request.                                                                      |
| `HOST`             | 0.0.0.0 | Interfaz de escucha. Cambiar a `127.0.0.1` para mayor aislamiento.                                |

## Llamar desde el API

El endpoint de la API `POST /api/listening/competitors/detect` con
`{source: 'facebook', accounts: [...]}` delega en este servicio. El API
hace el INSERT a `competitor_posts` con dedupe por `post_url` — el scraper
solo entrega los items, no escribe a la DB.

Si `COMPETITOR_SCRAPER_URL` no está configurado en el API, el endpoint
responde `503 competitor_scraper_not_configured`.

## Modo CLI (debug)

Útil para correr un scrape desde el VPS sin pasar por la API:

```bash
# Crear config.json
cat > /tmp/config.json <<EOF
{
  "accounts": ["https://www.facebook.com/NoticiasPerote2.0"],
  "maxPostsPerAccount": 3,
  "sinceDate": "2026-01-01"
}
EOF

# Ejecutar (lee cookies del FB_COOKIES_FILE configurado)
docker compose run --rm competitor-scraper --config /tmp/config.json
# Imprime un JSON por línea a stdout (Docker convention)
```

## RAM y recursos

El contenedor de Chromium consume **250-400 MB en runtime** (idle ~50 MB).
El `mem_limit: 768m` en `docker-compose.yml` lo acota. Si el host tiene
<2 GB libres, el contenedor puede OOM-kill y Dokploy lo recupera solo
gracias a `restart: unless-stopped`.

## Tests

22 unit tests (utils + cookies, sin Playwright). Para correrlos dentro del
contenedor del scraper:

```bash
docker run --rm -v "$(pwd)":/app -w /app node:22-slim sh -c \
  "npm install --no-audit --no-fund && npx vitest run"
```

Los tests del **branch de Facebook en el API** viven en
`apps/api/scripts/check-competitor-scraper.js` y se corren con
`bash /home/karol/creacontenidos-work/run-check.sh` (usa un stub HTTP
local, no requiere el scraper real levantado).

## Operación

- **Logs**: `docker compose logs -f competitor-scraper`. Mensajes clave:
  - `Loaded N cookie(s) from ...` — cookies cargadas al arrancar
  - `Session check OK / FAILED` — después de cada scrape, valida que la
    sesión sigue viva
  - `scraping Facebook page for account "..."` — por cada cuenta
  - `Login wall detected` — la página está detrás del muro (sesión expiró)
- **Sin cookies** = solo scrapea páginas 100% públicas (casi siempre el
  muro de login aparece a los pocos posts).
- **APIs externas**: ninguna. No usa Perplexity/Claude/Apify — solo Playwright.

## Por qué self-hosted (no Apify Cloud)

Decisión tomada en el plan de integración: el scraper vive en el mismo VPS
que la API para evitar un proveedor externo más (costo, latencia, complejidad
operacional). El RAM disponible en el host (7.8 GB) alcanza para el
contenedor de Playwright sin comprometer el resto.
