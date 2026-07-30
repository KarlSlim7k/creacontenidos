# Verificación integral pre-lanzamiento — CREA Command Center (2026-07-30)

> **Alcance:** validación end-to-end de los 7 módulos de la plataforma (listening, content-engine,
> editorial, distribution, public, newsletter, telegram, commercial) tanto en código (`apps/web`,
> `apps/admin`, `apps/api`) como en producción real (VPS `srv1562002` vía Tailscale SSH + API de
> Dokploy). Cada hallazgo fue verificado ejecutando el flujo real contra datos reales — nada
> especulativo. Incluye 2 bugs de producción encontrados y corregidos durante la verificación.

## Resumen ejecutivo

La plataforma pasó la verificación técnica completa: backend (12/12 checks), frontend (build +
typecheck limpios, 0 errores de consola en QA con Playwright en 3 viewports), y los 7 flujos de
negocio ejercitados end-to-end en producción con datos reales (5 notas publicadas por el pipeline
completo de IA, 1 newsletter enviado de verdad vía Resend, 1 notificación de Telegram entregada al
director, 1 lead recorriendo el pipeline comercial completo, 1 scrape real de Facebook generando un
topic de RADAR). En el proceso se encontraron y corrigieron dos bugs reales que llevaban tiempo sin
detectarse porque fallaban en silencio: el token de Telegram en producción estaba guardado con su
valor enmascarado en vez del real (el cron de revisión editorial nunca pudo notificar a nadie desde
que se activó), y los links que Distribution genera para compartir notas apuntaban a una ruta
retirada en la migración a Astro (404 garantizado en cualquier link compartido por WhatsApp o
Facebook). Ambos ya están corregidos, deployados y verificados. Se resolvieron además dos huecos de
infraestructura que hubieran sido serios si el sitio hubiera tenido un incidente antes de agosto:
no existía ningún backup de la base de datos de producción, y `www.crea-contenidos.com` daba 404.

## Tabla de hallazgos y acciones de esta sesión

| ID | Severidad | Área | Hallazgo | Acción tomada | Estado |
|----|-----------|------|----------|----------------|--------|
| L1 | **Crítica** | Telegram | `TELEGRAM_BOT_TOKEN` en Dokploy guardado como el valor enmascarado `8329768505:***` en vez del token real. El cron de revisión editorial (`telegram-review-cron.js`, corre cada minuto desde `TELEGRAM_REVIEW_ENABLED=true`) llevaba activo sin poder enviar nada, sin generar ningún error visible (`activity_log` no tenía ni un solo registro `telegram_review_sent`). | Token real recibido del usuario, verificado contra `api.telegram.org/getMe` (200, bot `CreaContenidos_bot`), actualizado vía API de Dokploy, redeploy, y confirmado con prueba real: nota enviada a revisión → mensaje entregado al chat del director (`telegram_review_sent... exito`, `message_id` registrado en `telegram_review_notifications`). | ✅ Corregido y verificado |
| L2 | **Alta** | Distribution | `noteUrl()` en `apps/api/src/modules/distribution/index.js:22` generaba `/nota.html?slug=...` — ruta retirada al migrar `apps/web` a Astro SSR. Cualquier link compartido por WhatsApp o generado al activar Facebook resultaba en 404 real. | Corregido a `/notas/:slug` (mismo patrón que ya usa el sitemap en `server.js:71`). Commit `6fe7b11`, push a `master`, auto-deploy de Dokploy confirmado, verificado con llamada real a `/api/distribution/whatsapp` (URL correcta, HTTP 200). | ✅ Corregido, deployado, verificado |
| L3 | **Alta** | Infraestructura | No existía ningún backup automatizado de `crea_command_center` (Postgres). Sí existía backup para otro proyecto del mismo VPS (`impulsatec`, MySQL), pero nada para CREA — pérdida total de contenido/leads si el volumen se corrompe. | Script `pg_dump` + gzip en `/opt/backups/creacontenidos/backup_db.sh` (mismo patrón que `impulsatec`), cron diario 3:15am, retención 14 días. Verificado con corrida real (68K, 24 tablas volcadas). | ✅ Resuelto |
| L4 | Media | Infraestructura/DNS | `www.crea-contenidos.com` devolvía 404 de Traefik (el certificado SSL existía pero no había router configurado para ese host en Dokploy). | Dominio agregado vía API de Dokploy apuntando al mismo compose, redeploy disparado. Verificado: `200` sin downtime del dominio apex. | ✅ Resuelto |
| L5 | Media | Contenido | El sitio en producción tenía 0 artículos publicados (5 en borrador, 5 en propuesta) — el gate editorial nunca se había completado para ningún tema real. | Elegidos 5 temas positivos y verificados de RADAR (confianza 98-100%, fuente municipal), pasados por el pipeline completo (propuesta IA → borrador → imagen → slug → revisión → publicación). 4 quedaron publicadas; 1 regresada a borrador por defecto de imagen (ver L6). | ✅ 4/5 publicadas, sitio con contenido real |
| L6 | Baja | Content-engine (calidad IA) | La imagen generada para "Perote certificado como destino turístico" tenía texto ilegible en el banner (`"MUNICALA MÉXICO"`), artefacto típico de modelos de generación con texto. | Nota regresada a `borrador` a petición del usuario, pendiente de que el equipo editorial regenere la imagen o la edite manualmente antes de re-publicar. | 🟡 Pendiente de revisión editorial |
| L7 | Info | Distribution | Ningún canal de Facebook activo (`FACEBOOK_PAGE_ID`/`TOKEN` vacíos en prod) — solo WhatsApp (no requiere credenciales) está "conectado" hoy. | Sin acción — pendiente por instrucción explícita del usuario ("queda pendiente hasta nuevo aviso"). | ⏸️ Pausado a petición del usuario |
| L8 | Info | Newsletter | Solo 1 suscriptor real activo en Resend. | Sin acción — dato informativo para planear el crecimiento de la lista antes de agosto. | ℹ️ Informativo |

## Verificación por módulo (evidencia real)

### Backend (`apps/api`)
- `npm run test:all` (12 checks): **12/12 OK** — admin panel, ai-fallback, API pública, leads,
  newsletter, content-engine, listening/RADAR, social, competitor-scraper (Facebook), Telegram,
  e2e completo.
- `apps/admin`: `npm run test` (6/6, hash-router) y `npm run build` limpios.

### Frontend (`apps/web`)
- `astro check`: 0 errores/warnings/hints en 41 archivos. `astro build`: limpio.
- QA con Playwright en 3 viewports (móvil 375px, tablet 768px, desktop 1280px) sobre 11 páginas:
  0 errores de consola JS reales (los 403/timeouts iniciales resultaron ser trackers externos de
  TikTok, no bugs del sitio).
- Dos fixes de estilo aplicados: título del 404 de nota (antes genérico "Nota", ahora descriptivo),
  y `.grid-4` en `legacy.css` ahora escala a 2 columnas en tablet (antes saltaba de 1 a 4 columnas
  directo a partir de 900px, dejando el rango 640-899px sin aprovechar el ancho).
- Menú móvil (hamburguesa) y nav con scroll horizontal verificados funcionalmente vía DOM real
  (no eran bugs, son patrones de diseño intencionales confirmados con `getComputedStyle`).

### Producción (VPS, dominio real)
- SSL válido (Let's Encrypt, vigente hasta 1-sep-2026), HSTS, CSP a medida, HTTP→HTTPS 301,
  todos verificados con `curl -I` real contra `https://crea-contenidos.com`.
- DKIM de Resend configurado; **sin SPF ni DMARC** — riesgo de que el newsletter caiga en spam
  (no corregido esta sesión, queda como pendiente).
- Backend en logs sin errores en las últimas 24h antes de empezar la sesión.

### Listening / RADAR
- Cron automático (`listening-cron.js`, cada 6h) confirmado corriendo sin fallos en los últimos
  4 días vía `activity_log` (`radar_detect_auto... exito` en cada tick: 00:01, 06:01, 12:01, 18:01
  CDMX).
- Competitor scraper de Facebook (`apps/competitor-scraper`, self-hosted en Dokploy) probado en
  vivo: `POST /api/listening/competitors/detect {source: facebook}` scrapeó 1 post real nuevo de
  una cuenta de competencia activa, lo insertó con dedupe correcto, y generó 1 topic de RADAR.

### Content-engine → Editorial → Distribution (pipeline completo)
5 notas generadas y publicadas de punta a punta contra producción real, autenticado como director:
propuesta con IA (Nous Portal) → aprobación → borrador extendido → imagen de portada (OpenRouter)
→ slug → envío a revisión → publicación. 4 visibles hoy en `/api/public/articles`, sitemap y home
real; 1 regresada a borrador por calidad de imagen (L6).

### Newsletter
Generado con IA a partir de los topics reales de RADAR, HTML revisado (preheader, unsubscribe
token de Resend, contenido coherente), y **enviado de verdad** — `broadcastId` real de Resend
confirmado, estado `enviado` en `newsletter_editions`.

### Telegram
Bug L1 corregido; flujo de notificación de revisión editorial verificado con un envío real al chat
del director configurado en producción.

### Commercial
Flujo completo probado con datos de prueba, luego limpiados: lead público (`POST
/api/public/leads`) → aparece en panel (`GET /api/commercial/leads`) → convertido a cliente
(`POST /leads/:id/convert`) → recorrido de las 4 etapas del pipeline (identificado → contactado →
propuesta_enviada → cerrado) → registros de prueba borrados de producción (`DELETE` en ambos,
confirmado `204` y ausencia posterior).

## Pendientes para el lanzamiento de agosto (no resueltos esta sesión)

Por orden de impacto:

1. **Legal**: sin aviso de privacidad (LFPDPPP) — ya hay datos personales reales capturándose
   (leads, newsletter). Bloqueante antes de exponer el sitio ampliamente.
2. **SPF + DMARC** para `crea-contenidos.com` — solo DKIM configurado hoy; riesgo real de que el
   newsletter caiga en spam masivamente.
3. **Imagen de la nota de certificación turística** (L6) — regenerar o editar manualmente antes de
   re-publicar.
4. **Monitoreo**: sin error tracking (Sentry) ni uptime monitoring externo — hoy el único canal de
   alerta es revisar logs manualmente.
5. **Contenido real vs. cifras de `/estudio`**: confirmar que "42K alcance mensual", "+1K oyentes",
   etc. sean datos reales antes de que un cliente comercial las cuestione.
6. **Facebook automático**: pausado a petición explícita del usuario — retomar cuando se decida
   activar `FACEBOOK_PAGE_ID`/`FACEBOOK_PAGE_ACCESS_TOKEN`.
7. **Crecimiento de la lista de newsletter**: 1 solo suscriptor real hoy.

## Archivos modificados en esta sesión

- `apps/api/src/modules/distribution/index.js` — fix `noteUrl()` (L2).
- `apps/web/src/pages/notas/[slug].astro` — título del 404 descriptivo.
- `apps/web/src/styles/legacy.css` — `.grid-4` responsive en tablet.
- `/opt/backups/creacontenidos/backup_db.sh` (VPS, fuera del repo) — script de backup nuevo.
- Configuración de Dokploy (dominio `www`, `TELEGRAM_BOT_TOKEN`) — cambios de infraestructura, no
  versionados en git por diseño (viven en la config de Dokploy / `.env` de producción).

Commit: `6fe7b11` — "fix: URL de nota rota en distribution + título 404 + grid tablet" (pusheado a
`master`, auto-deploy de Dokploy confirmado).
