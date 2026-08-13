# Auditoría defensiva local — portal público (`apps/web`)

Fecha: 2026-08-12

Alcance: portal Astro, rutas `/api/public/*` que consume, formularios de leads/newsletter y renderizado de datos públicos.

Entorno: PostgreSQL 16 efímero en RAM, API/SSR ligados a `127.0.0.1`, secretos ficticios y sin acceso a la base o al VPS de producción.

## Resumen ejecutivo

No se confirmó ninguna vulnerabilidad crítica ni alta en el portal público. Las defensas principales funcionan: consultas SQL parametrizadas, validación y límites de longitud en formularios, límite de cuerpo JSON, CSP con nonce, CORS restringido en producción, escape de contenido y doble opt-in.

Los tres hallazgos fueron corregidos localmente el 2026-08-12 y cuentan con regresiones ejecutables. No quedan hallazgos confirmados abiertos en este alcance; sigue recomendándose restringir el origen a rangos de Cloudflare como defensa de infraestructura.

## Hallazgos de severidad media

### SEC-01 — La cabecera `CF-Connecting-IP` permite evadir los rate limits si el origen es alcanzable

- Rule ID: EXPRESS-PROXY-001 / EXPRESS-AUTH-001
- Severidad: Media
- Estado: Corregido
- Ubicación: `apps/api/src/lib/client-ip.js:4-39`; consumidores en `apps/api/src/modules/public/index.js:15`, `:171` y `:246`.
- Evidencia:

  ```js
  const clientIp = isCloudflareProxy(req.ip) && typeof cloudflareIp === 'string'
    ? cloudflareIp
    : req.ip;
  ```

  Antes del fix, cambiar solo `CF-Connecting-IP` permitió ocho respuestas `201`. Después del fix, la regresión de integración rota esa cabecera desde una conexión directa y recibe `429` al alcanzar el límite.
- Impacto: si el origen/Traefik acepta conexiones que no vienen de Cloudflare, un atacante puede rotar esa cabecera y eludir los límites de leads, newsletter, vistas y lecturas públicas. En newsletter podría consumir cuota y enviar correos de confirmación a terceros; esta consecuencia se infiere del flujo, pero no se ejecutó para evitar efectos externos.
- Fix aplicado: la aplicación usa `node:net.BlockList` con los rangos oficiales IPv4/IPv6 de Cloudflare y solo acepta `CF-Connecting-IP` si el salto identificado por Traefik pertenece a ellos.
- Mitigación: límites adicionales globales por ruta, CAPTCHA progresivo para escrituras públicas y alertas por volumen anómalo.
- False positive notes: el riesgo queda fuertemente reducido si firewall y Traefik ya impiden por completo el acceso directo al origen. Esto debe verificarse en infraestructura; no se inspeccionó el VPS.

## Hallazgos de severidad baja

### SEC-02 — Los enlaces de confirmación del newsletter no caducan

- Rule ID: EXPRESS-INPUT-001
- Severidad: Baja
- Estado: Corregido
- Ubicación: `apps/api/src/lib/newsletter-optin.js:1-30`, función `makeToken/readToken`.
- Evidencia:

  ```js
  const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;
  if (issuedAt > now + TOKEN_CLOCK_SKEW_MS || now - issuedAt > TOKEN_TTL_MS) return null;
  ```

- Impacto: un enlace filtrado en logs, historial o correo puede reutilizarse indefinidamente para activar esa dirección. El correo también queda codificado, no cifrado, dentro del token.
- Fix aplicado: fecha de emisión incluida en el payload HMAC y caducidad de 72 horas; los tokens antiguos sin timestamp se rechazan.
- Mitigación: conservar `Referrer-Policy: no-referrer` y evitar registrar query strings sensibles.
- False positive notes: confirmar solo cambia el estado de la dirección incluida en el token; no concede acceso a cuentas, por eso la severidad es baja.

### SEC-03 — El manejador global devuelve mensajes internos de errores 4xx

- Rule ID: EXPRESS-ERROR-001
- Severidad: Baja
- Estado: Corregido
- Ubicación: `apps/api/src/middleware/error-handler.js:6-12`, función `errorHandler`.
- Evidencia:

  ```js
  const safeMessage = err.type === 'entity.parse.failed'
    ? 'JSON inválido'
    : ...;
  ```

  Antes del fix, `{not-json` devolvía detalles del parser. Ahora responde únicamente `{ "error": "JSON inválido" }`.
- Impacto: revela detalles del parser y puede reflejar fragmentos de entrada en respuestas. No se observaron stacks, rutas locales, SQL ni secretos.
- Fix aplicado: los errores `entity.parse.failed` se mapean al mensaje fijo `JSON inválido`.
- Mitigación: mantener el mensaje genérico actual para todo 500 y sanitizar logs.
- False positive notes: la exposición observada es de bajo valor y no permite ejecución de código.

## Pruebas realizadas

- Suite `test:public`: API pública, fixes de seguridad, gate editorial, 404, imágenes, rate limit, leads, honeypot y CSP; 4/4 checks aprobados.
- Payloads SQL, HTML/JS y shell en todos los campos de lead: almacenados como texto; tabla intacta y sin ejecución.
- Arrays, objetos, números, campos faltantes, email inválido, JSON malformado y cuerpo de 150 KB: rechazados con 400/413.
- Inyección en sección, slug, autor, ID social y ruta de imagen: sin SQL injection, traversal ni fuga de stack/consulta.
- CORS hostil: sin `Access-Control-Allow-Origin`; origen permitido: cabecera correcta.
- Redirección del host `www`: destino fijo en `crea-contenidos.com`, sin open redirect.
- Chromium real con artículo y metadata social maliciosos almacenados: `globalThis.__CREA_XSS` permaneció ausente, no apareció `img[src=x]`, y el embed producido fue un iframe de YouTube con URL fija.
- `npm audit --offline --omit=dev` en API y web: 0 avisos en la caché local. Esto no reemplaza un escaneo conectado y actualizado.
- Búsqueda estática: sin `eval`, `new Function`, ejecución de shell alcanzable desde HTTP, secretos trackeados, path de archivo controlado por usuario ni SQL concatenado con entrada pública.

## Controles positivos verificados

- CSP con nonce por respuesta y sin `unsafe-inline` en `script-src`.
- `X-Content-Type-Options`, protección anti-frame y ausencia de `X-Powered-By`.
- Consultas parametrizadas para todas las entradas públicas revisadas.
- Escape correcto de contenido editorial, leads y títulos de embeds.
- Newsletter con doble opt-in y comparación HMAC timing-safe.
- Docker ejecuta Node como usuario no privilegiado y publica la API host solo en `127.0.0.1`.

## Límites de esta auditoría

No se tocó producción, el VPS, la base real, Cloudflare, Traefik ni Resend. No se enviaron correos reales ni se probaron ataques volumétricos de denegación de servicio. Al validar el componente de embed, Chromium cargó una vez el iframe público de YouTube esperado por ese flujo; no hubo autenticación ni escritura externa. La configuración efectiva del firewall/origen debe revisarse antes de cerrar SEC-01.
