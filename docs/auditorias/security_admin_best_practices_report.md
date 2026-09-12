# Auditoría defensiva local — panel interno (`apps/admin`)

Fecha: 2026-08-12

Alcance: SPA Vite/TypeScript en `apps/admin`, autenticación/2FA, autorización por rol y endpoints `/api/*` consumidos por sus pantallas. La auditoría pública anterior permanece en `security_best_practices_report.md`.

Entorno: PostgreSQL 16 efímero en `tmpfs`, API ligada a `127.0.0.1`, secretos ficticios, mocks de navegador y build local. No se consultó ni modificó la base persistente, el VPS o servicios externos.

## Resumen ejecutivo

Se confirmaron y corrigieron los hallazgos de autorización, sesión, login y renderizado del panel. Una segunda pasada migró la sesión del navegador a cookie `HttpOnly`, añadió CSRF, revocación real, 2FA obligatorio para directores, límite por cuenta y protección del último director. No quedan hallazgos de aplicación críticos/altos abiertos en este alcance local; Cloudflare Access y el aislamiento en subdominio permanecen como defensa de infraestructura opcional.

No se encontró SQL injection, command injection, path traversal, ejecución dinámica (`eval`/`Function`), secretos empotrados ni acceso administrativo sin autenticación. Las consultas alcanzables desde el panel son parametrizadas y Docker ejecuta Node sin privilegios.

## Hallazgos de severidad alta

### ADMIN-01 — El backend confiaba en módulos ocultos por la SPA

- Rule ID: EXPRESS-INPUT-001 / Broken Access Control
- Severidad: Alta
- Estado: Corregido
- Ubicación: `apps/api/src/modules/editorial/index.js:15-37,88-90,322,362`; `apps/api/src/modules/content-engine/index.js:10-12`; `apps/api/src/modules/listening/index.js:11-13`.
- Evidencia: antes del fix, varias lecturas y mutaciones de propuestas, IA, RADAR, ideas, pipeline y métricas solo ejecutaban `requireAuth`; el mapa canónico en `apps/api/src/modules/auth/role-modules.js:4-8` no concede esos módulos a comercial/colaborador.
- Impacto: una cuenta comercial o colaboradora autenticada podía saltarse el menú y llamar directamente endpoints editoriales, leer propuestas/RADAR y, en algunos casos, modificar contenido o consumir APIs de IA de pago.
- Fix aplicado: gates de familia `director|produccion` para propuestas, content-engine y listening; ideas limitadas a los tres roles que poseen el módulo; pipeline/métricas con rol explícito.
- Mitigación: conservar las pruebas 403 de `apps/api/scripts/check-admin-api.js:76-85` y revisar el gate al crear una familia nueva.
- False positive notes: ocultar elementos en el frontend sí mejoraba UX, pero nunca fue una frontera de autorización.

### ADMIN-02 — Bajas y cambios de rol no revocaban un JWT emitido

- Rule ID: EXPRESS-SESS-002 / Broken Access Control
- Severidad: Alta
- Estado: Corregido
- Ubicación: `apps/api/src/middleware/auth.js:5-36`.
- Evidencia: el JWT dura ocho horas y antes `requireAuth` copiaba `name/role` directamente de sus claims. Desactivar o degradar un usuario en DB no afectaba otras rutas hasta expirar el token.
- Impacto: una cuenta desactivada o un director degradado podía conservar durante horas los privilegios anteriores, incluido publicar, borrar o administrar usuarios.
- Fix aplicado: cada request autenticado relee `id/name/role/active` de DB; usuario ausente/inactivo recibe 401 y `requireRole` usa el rol vivo. La migración `041_add_user_session_version.sql` añade una versión comparada con el claim `sv`; logout y cambios sensibles la incrementan. JWT y token pendiente aceptan solo HS256.
- Mitigación: si el volumen futuro vuelve costosa la lectura, cachear la versión de sesión; no volver a confiar solo en el rol firmado.
- False positive notes: la firma impedía modificar el token, pero no podía reflejar cambios posteriores en la cuenta.

## Hallazgos de severidad media

### ADMIN-03 — URLs de API llegaban a contextos navegables sin allowlist de protocolo

- Rule ID: JS-URL-001 / JS-URL-002
- Severidad: Media
- Estado: Corregido
- Ubicación: `apps/admin/src/util.ts:14-27`; `apps/admin/src/screens/radar.ts:191-197`; `apps/admin/src/actions.ts:609-615`; recursos de editor en `apps/admin/src/screens/editor.ts:15-22,197-200`.
- Evidencia: `esc()` protege atributos HTML, pero no convierte `javascript:` en una URL segura. `post_url`, `share_url` e imágenes provienen de DB/API.
- Impacto: un dato externo malicioso podía producir navegación activa al pulsarlo o abrir una URL no prevista desde una sesión administrativa.
- Fix aplicado: `safeHttpUrl()` acepta solo HTTP(S) o rutas locales absolutas; enlaces, `window.open` e imágenes externas pasan por el helper. Las ventanas nuevas usan `noopener`.
- Mitigación: validar también al ingresar/persistir URLs en el backend y mantener CSP estricta.
- False positive notes: CSP y `rel=noopener` reducían algunos resultados; no sustituyen la validación del protocolo.

### ADMIN-04 — Handlers inline eran bloqueados por la CSP estricta

- Rule ID: JS-XSS-004 / JS-CSP-002
- Severidad: Media
- Estado: Corregido
- Ubicación: `apps/admin/src/main.ts:8-14`; `apps/admin/src/actions.ts:1004-1030`; `apps/admin/src/screens/editor.ts:126-137,154-162`.
- Evidencia: el editor renderizaba `onchange`/`onerror` inline, mientras `apps/api/src/server.js:61-76` no habilita `unsafe-inline` en `script-src`.
- Impacto: los controles de portada, sensibilidad y patrocinio fallaban bajo CSP de producción; además, conservar handlers inline obliga a debilitar CSP o crea sinks de código difíciles de auditar.
- Fix aplicado: eventos delegados en TypeScript, cero atributos `on*`, previews `srcdoc` con `sandbox` sin scripts.
- Mitigación: el check local falla si reaparece cualquier handler inline en las pantallas.
- False positive notes: el fallo puede no verse bajo `vite dev` sin las cabeceras Helmet, pero sí bajo el servidor de producción.

### ADMIN-05 — Rate limit de login no usaba la identidad de cliente validada detrás de Cloudflare

- Rule ID: EXPRESS-PROXY-001 / EXPRESS-AUTH-001
- Severidad: Media
- Estado: Corregido
- Ubicación: `apps/api/src/modules/auth/index.js:13-20`; helper compartido en `apps/api/src/lib/client-ip.js`.
- Evidencia: login y verificación 2FA usaban la clave predeterminada de `express-rate-limit`; con la topología documentada, `req.ip` puede ser el edge de Cloudflare y agrupar visitantes distintos.
- Impacto: usuarios legítimos podían bloquearse entre sí y la protección perdía precisión para intentos distribuidos.
- Fix aplicado: ambos limiters reutilizan `rateLimitKey`, que solo acepta `CF-Connecting-IP` cuando el salto verificado pertenece a Cloudflare. Login añade además una ventana por correo normalizado y hasheado, independiente de la IP (`apps/api/src/modules/auth/index.js:19-33`).
- Mitigación: añadir CAPTCHA progresivo si aumenta el abuso.
- False positive notes: el comportamiento exacto depende de Traefik/Cloudflare; la corrección conserva fallback seguro a `req.ip`.

## Hallazgos de severidad baja

### ADMIN-06 — Desuscripción push sin comprobar propietario

- Rule ID: Broken Object Level Authorization
- Severidad: Baja
- Estado: Corregido
- Ubicación: `apps/api/src/modules/auth/index.js:354-361`.
- Evidencia: antes se eliminaba por `endpoint` únicamente.
- Impacto: un usuario autenticado que conociera el endpoint opaco de otra suscripción podía desactivarla.
- Fix aplicado: `DELETE` exige simultáneamente `endpoint` y `req.user.id`.
- Mitigación: no registrar endpoints push completos.
- False positive notes: los endpoints son largos y difíciles de adivinar, por eso la severidad es baja.

### ADMIN-07 — Contraseñas mayores al límite efectivo de bcrypt

- Rule ID: EXPRESS-INPUT-001
- Severidad: Baja
- Estado: Corregido
- Ubicación: `apps/api/src/modules/auth/index.js:26,42-57,132-140,241-248,263-274`.
- Evidencia: bcrypt solo considera los primeros 72 bytes, pero creación/cambio permitía cadenas mayores.
- Impacto: contraseñas distintas después del byte 72 podían autenticar como equivalentes y generar una expectativa falsa de entropía.
- Fix aplicado: login, alta, perfil y edición aceptan de 8 caracteres a 72 bytes UTF-8.
- Mitigación: documentar el límite junto al formulario.
- False positive notes: no permite descubrir contraseñas; afecta semántica y robustez de credenciales muy largas.

## Segunda pasada de autenticación

### ADMIN-08 — JWT persistente en `localStorage`

- Rule ID: JS-STORAGE-001
- Severidad: Media
- Estado: Corregido
- Ubicación: cookie en `apps/api/src/lib/auth-session.js:4-57`; validación en `apps/api/src/middleware/auth.js:16-44`; cliente CSRF en `apps/admin/src/store.ts:584-600`.
- Evidencia: `localStorage.setItem('crea-admin-token', ...)` hace el token legible por cualquier JavaScript del mismo origen y persistente entre reinicios.
- Impacto: una futura XSS, script de terceros comprometido o acceso al perfil local del navegador puede extraer una sesión administrativa de hasta ocho horas.
- Fix aplicado: cookie host-only `HttpOnly; Secure` en producción y `SameSite=Strict`; token CSRF aleatorio en cookie separada y cabecera `X-CSRF-Token` con comparación constante. El frontend dejó de almacenar o leer JWT. Login/2FA rotan cookies y logout las expira.
- Mitigación actual: CSP sin `unsafe-inline`/`unsafe-eval`, escape sistemático, allowlist de URLs y revocación viva contra DB.
- False positive notes: no existe explotación sin otro acceso al navegador/origen; es una debilidad de impacto encadenado, no una toma directa de cuenta.

### ADMIN-09 — Seed con cuentas de desarrollo utilizable por error en producción

- Rule ID: EXPRESS-AUTH-001
- Severidad: Crítica si se ejecuta en producción
- Estado: Corregido
- Ubicación: `apps/api/src/db/seed.js:8-16`; credenciales de fixtures en `apps/api/src/db/seeds/003_admin_seed.sql:1-14`.
- Fix aplicado: el comando aborta antes de conectarse a PostgreSQL cuando `NODE_ENV=production`; Docker continúa ejecutando únicamente migraciones al arrancar.

### ADMIN-10 — Director sin 2FA y cambios sensibles sin reautenticación

- Rule ID: EXPRESS-AUTH-001 / EXPRESS-SESS-002
- Severidad: Alta
- Estado: Corregido
- Ubicación: gate de incorporación en `apps/api/src/middleware/auth.js:42-46`; reautenticación en `apps/api/src/modules/auth/index.js:56-70,300-338`.
- Fix aplicado: salvo en procesos automatizados `NODE_ENV=test`, un director sin 2FA sólo accede a sesión, perfil, incorporación 2FA y logout. Crear usuarios o cambiar rol, correo, contraseña o estado exige el segundo factor; el último director activo no puede desactivarse/degradarse.

### ADMIN-11 — Reconfiguración de 2FA desde una sesión existente

- Rule ID: EXPRESS-AUTH-001
- Severidad: Alta
- Estado: Corregido
- Ubicación: `apps/api/src/modules/auth/index.js:231-289`.
- Fix aplicado: `/2fa/setup` rechaza reemplazar un factor ya activo; desactivarlo exige el factor vigente, consume códigos de respaldo usados y está prohibido para directores. Activar o desactivar 2FA rota `session_version`, revoca las demás sesiones y entrega una cookie nueva sólo a quien presentó el código válido.

### ADMIN-12 — Recuperación y cambio de contraseña

- Rule ID: EXPRESS-AUTH-001 / EXPRESS-SESS-002
- Severidad: Alta
- Estado: Corregido
- Ubicación: `apps/api/src/modules/auth/index.js`; token en `apps/api/src/lib/password-reset.js`; interfaz en `apps/admin/src/auth.ts`.
- Fix aplicado: respuesta uniforme para evitar enumeración, límites por IP y cuenta, enlace HMAC de una hora ligado a `session_version`, actualización atómica de un solo uso, revocación de sesiones y limpieza de cookies. La interfaz pide confirmar la contraseña y el login/reset ofrecen un botón accesible para mostrarla sin alterar el valor escrito.

## Pruebas realizadas

- `npm run test:unit` en API: 5/5 checks aprobados, incluido el nuevo `check-admin-security.js`.
- `npm test` y `npm run build` en admin: tests TypeScript y build Vite aprobados.
- Integración `check:admin` contra PostgreSQL 16 efímero en RAM: 41 migraciones/seed, 401/403 por rol, cookie HttpOnly, CSRF, revocación de logout, protección del último director, ideas, propuesta→publicación, RADAR, comercial, leads, distribución y borrados; aprobada.
- Pruebas directas nuevas: colaborador→propuestas 403; comercial→ideas/pipeline/métricas/content-engine 403; colaborador→RADAR 403; password de 73 bytes 400.
- Payloads de protocolo: `javascript:` y `data:text/html` rechazados; HTTP(S) y rutas locales permitidos.
- Búsqueda estática: cero handlers inline en pantallas; sin `eval`, `new Function`, ejecución shell alcanzable desde HTTP ni SQL concatenado con input.
- `npm audit --offline --omit=dev` en API y admin: 0 vulnerabilidades en la caché local. No reemplaza un advisory scan conectado y actualizado.
- `git diff --check`: aprobado.

## Controles positivos verificados

- Helmet antes de estáticos, CSP con nonce, anti-frame, `nosniff` y sin `X-Powered-By`.
- Cuerpo JSON limitado explícitamente a 100 KB (`apps/api/src/server.js:80`).
- 2FA TOTP con secret cifrado y códigos de respaldo hasheados; token pendiente no autoriza otras rutas.
- SQL parametrizado en rutas revisadas y allowlists para roles/estados/secciones.
- Rate limits para login, 2FA y operaciones de IA.
- Docker con usuario no privilegiado y API publicada en host solo sobre `127.0.0.1`.

## Límites

No se probaron producción, VPS, Cloudflare, Traefik, base real, proveedores de IA, correo, WordPress, Meta ni push real. No se hicieron ataques volumétricos. El `npm audit` fue offline. La configuración efectiva de cabeceras y firewall debe comprobarse en despliegue antes de considerar cerrados los controles de infraestructura.
