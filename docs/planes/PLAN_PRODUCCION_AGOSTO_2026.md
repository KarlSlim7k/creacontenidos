# PLAN — Cierre de producción y lanzamiento de agosto 2026

Estado: en ejecución desde el 1 de agosto de 2026; Fases 1–3 completadas en producción.
Alcance: portal público, Command Center, API, despliegue Dokploy/VPS y continuidad de IA.  
Fuera de alcance: aumentar la cantidad de notas publicadas.

## 1. Objetivo y criterio de salida

La plataforma queda lista para lanzamiento cuando:

1. No haya violaciones CSP ni errores de consola en los flujos públicos.
2. Newsletter, contacto, menú móvil, publicación, RADAR y revisión editorial pasen un smoke real.
3. SPF, DKIM y DMARC pasen en un correo recibido fuera del dominio.
4. Exista un backup fuera del VPS y una restauración comprobada en una base aislada.
5. Una caída del portal/API y un fallo del backup generen una alerta externa.
6. `www` redirija al dominio canónico y cada página publique canonical correcto.
7. El aviso de privacidad describa las conexiones y embeds realmente usados.
8. Las métricas comerciales publicadas tengan evidencia o se retiren temporalmente.
9. La generación de texto sobreviva a una falla de modelo y a una caída completa de Nous.
10. Todos los checks locales y el smoke de producción estén verdes durante 24 horas.

No se considera cierre sustituir pruebas por inspección visual ni relajar seguridad con
`unsafe-inline`, desactivar CSP o publicar contenido generado sin revisión humana.

## 2. Foto actual verificada

| Área | Estado al 2026-08-01 | Decisión |
|---|---|---|
| HTTPS, HSTS, robots, sitemap | Operativos | Conservar |
| API, Postgres, scraper Facebook | Contenedores healthy | Conservar |
| Cookies Facebook | Archivo actualizado, `600`, scraper autenticado | Cerrado |
| CSP | Bloquea scripts inline de Astro | P0 |
| Correo | Dominio Resend `verified`; SPF en `send.crea-contenidos.com` y DKIM correctos; DMARC ausente | P0 solo DMARC + prueba |
| Backup | `pg_dump` diario local, retención 14 días, gzip válido | P1: permisos, copia externa y restore |
| Monitoreo | Sin monitor externo ni error tracking | P1 |
| SEO de host | Apex y `www` responden 200; sin canonical | P1 |
| Contenido existente | 3 notas empiezan con un título Markdown duplicado | P1 |
| Privacidad | El texto niega cookies de terceros aunque la plataforma admite embeds sociales | P1 |
| Métricas Estudio | `42K`, `+1K` y distribución de edades activas | Gate de negocio |
| IA de texto | Nous primario; `AI_MODEL_FALLBACK` vacío; sin fallback de proveedor | P1 |
| OpenRouter | Key activa; USD 10 comprados, USD 1.10303 usados | Disponible para respaldo |

Corrección respecto a la auditoría anterior: no falta SPF. Resend usa el Return-Path del
subdominio `send`, cuyo TXT SPF y MX ya existen. Crear otro SPF en el apex no ayudaría y podría
introducir una configuración incorrecta.

## 3. Orden de ejecución

### Fase 1 — CSP y flujos públicos (P0, completada el 1 de agosto de 2026)

Evidencia de cierre: commit `796ab33`, `check:csp`, suite pública, build de la imagen Docker y
smoke con Chromium en móvil/escritorio. En producción se comprobaron cero errores CSP, menú por
puntero/teclado, lead creado y eliminado, conteo de vista 204, JSON-LD y doble opt-in completo con
el destinatario seguro de prueba de Resend; el contacto de prueba también fue eliminado.

Archivos principales: `apps/api/src/server.js`, layouts/componentes Astro con `<script>` y los
checks de la web.

- Generar un nonce criptográfico distinto por respuesta con `node:crypto`, antes de Helmet.
- Incluir ese nonce en `script-src` y propagarlo al render SSR de Astro.
- Aplicarlo a todos los scripts inline, incluido JSON-LD dinámico, newsletter, contacto, chips,
  menú y conteo de vistas.
- No añadir `unsafe-inline`. Los scripts estáticos que resulte más simple sacar a archivo propio
  pueden externalizarse; el JSON-LD dinámico seguirá usando nonce.
- Añadir un check pequeño que solicite dos páginas, confirme nonces distintos y verifique que cada
  `<script>` inline tiene el nonce permitido por su cabecera.
- Ejecutar Playwright en móvil y escritorio sobre portada, nota, comunidad y contacto.

Aceptación:

- Cero violaciones CSP en consola.
- Menú móvil abre y cierra con teclado/touch.
- Newsletter hace `POST`, muestra estado accesible y completa doble opt-in con un correo de prueba.
- Formulario de contacto crea un lead de prueba, que después se elimina desde el panel.
- El contador de vistas responde 204 y JSON-LD permanece en el HTML.

Rollback: revertir únicamente el commit CSP y redeploy; nunca desactivar Helmet como contingencia.

### Fase 2 — Autenticación de correo (P0, 0.5 día + propagación DNS)

- Crear una dirección o alias que reciba reportes, por ejemplo `dmarc@crea-contenidos.com`.
- Publicar inicialmente `_dmarc.crea-contenidos.com TXT` con política `p=none` y `rua` al alias.
- No modificar los registros SPF/MX de `send` ni el DKIM ya verificado.
- Enviar una suscripción y un newsletter controlados a Gmail/Outlook externos.
- Confirmar en `Authentication-Results`: `spf=pass`, `dkim=pass`, `dmarc=pass` y alineación.
- Observar reportes al menos 7 días; después subir a `p=quarantine` y finalmente evaluar `reject`.

Aceptación: DNS público visible, Resend continúa `verified`, DMARC pasa y el unsubscribe funciona.

Referencia: [Resend — Implementing DMARC](https://resend.com/docs/dashboard/domains/dmarc).

### Fase 3 — Backup recuperable y fuera del VPS (P1, completada el 1 de agosto de 2026)

Evidencia de cierre: backup local endurecido y validado, tarea diaria de Dokploy con retención 14,
objeto de 9,114,120 bytes presente en Cloudflare R2 y restaurado directamente con `pg_restore` en
Postgres 16 aislado. Coincidieron tablas, migraciones, notas publicadas, usuarios, leads e imágenes.
El contenedor temporal se eliminó. El heartbeat externo respondió solo después de generar y validar
un dump nuevo; RPO 24 h y RTO inicial 2 h quedan documentados en `docs/operacion-backups.md`.

- Endurecer el script actual con `umask 077`, directorio `700` y dumps/logs `600`; los backups
  actuales están demasiado abiertos (`664`).
- Mantener temporalmente el backup local diario y su retención de 14 días.
- Configurar una Destination S3 en Dokploy y un backup diario externo del Postgres del compose.
- Aplicar retención por cantidad/fecha en el destino externo.
- Restaurar el último dump en un Postgres aislado, nunca sobre producción.
- Verificar migraciones, conteos de tablas, artículos publicados, usuarios, leads y lectura de una
  imagen generada. Destruir solo la base aislada al concluir.
- Documentar RPO objetivo de 24 h y RTO inicial de 2 h.
- Conectar el cron a un heartbeat externo; solo marcar éxito después de validar el archivo.

Aceptación: objeto presente fuera del VPS, restore completo documentado y alerta si pasan más de
26 horas sin backup válido.

Referencia: [Dokploy — Database Backups](https://docs.dokploy.com/docs/core/databases/backups).

### Fase 4 — Monitoreo y respuesta (P1, 0.5–1 día)

- Crear monitores externos, no alojados en el mismo VPS:
  - portada con keyword `CREA Contenidos`;
  - `/api/public/articles?limit=1` para cubrir API + DB;
  - certificado/dominio;
  - heartbeat del backup.
- Ruta mínima: UptimeRobot Free, con checks cada 5 minutos y alertas a un correo que alguien revise.
- Definir un responsable primario y uno alterno, con tiempo de respuesta objetivo.
- Incorporar Sentry en la API si se proporciona DSN. No registrar prompts, JWT, cookies, emails,
  cuerpos de leads ni respuestas completas de proveedores.
- Si Sentry no está disponible antes del lanzamiento, mantenerlo como riesgo aceptado explícito;
  el uptime externo no sustituye error tracking.
- Actualizar `docs/ia/runbook-incidentes.md` con caída web/API, DB, backup y proveedores IA.

Aceptación: una prueba de caída controlada genera alerta y una excepción sintética aparece sin PII.

Referencia: [UptimeRobot Free](https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan).

### Fase 5 — SEO, legal y contenido visible (P1, 0.5–1 día)

- Crear redirección permanente de `www` al apex, conservando ruta y query. Preferir una Redirect
  Rule de Cloudflare; dejar un solo host que sirva contenido.
- Añadir canonical absoluto desde los layouts Astro usando `https://crea-contenidos.com` + pathname.
- Verificar Open Graph, sitemap y canonical en portada, sección, nota, perfil y Estudio.
- Actualizar privacidad para describir Cloudflare, Google Fonts y la carga de embeds sociales.
- Si un embed no esencial crea cookies/conexiones antes de interacción, usar click-to-load o
  consentimiento antes de activarlo. No afirmar que no existen cookies si no se puede garantizar.
- Corregir desde el panel las 3 notas cuyo cuerpo empieza con `**Título**`.
- Evitar recurrencia en `generateDraft`: pedir cuerpo sin repetir título ni Markdown y normalizar
  una cabecera inicial idéntica al título antes de persistir. Dejar un check unitario mínimo.
- Validar las cifras de Estudio. Sin evidencia, sustituirlas por texto no cuantitativo o retirarlas;
  no inventar una tabla nueva de procedencia.

Aceptación: `www/...` devuelve 301 al apex, canonical único, privacidad consistente, cero títulos
Markdown duplicados y acta simple de aprobación de métricas.

### Fase 6 — Respaldo de modelos/proveedores IA (P1, 1–1.5 días)

#### Decisión de arquitectura

Mantener el cliente central existente y agregar el mínimo código:

```text
Nous modelo primario
  -> Nous modelo secundario estable
    -> OpenRouter modelo free específico
      -> error visible; el contenido queda sin publicar
```

No añadir SDK: Node 22 ya incluye `fetch` y ambos proveedores hablan
`/v1/chat/completions` compatible.

Configuración propuesta:

```dotenv
AI_MODEL_FALLBACK=google/gemini-3.5-flash-lite
AI_OPENROUTER_FALLBACK_MODEL=google/gemma-4-26b-a4b-it:free
AI_TEXT_TIMEOUT_MS=45000
```

- `AI_MODEL_FALLBACK` cubre retiro/rate limit de un modelo dentro de Nous.
- `AI_OPENROUTER_FALLBACK_MODEL` habilita el respaldo de proveedor solo si también existe
  `OPENROUTER_API_KEY`.
- `openrouter/free` queda como override manual de contingencia, no como default: selecciona modelos
  dinámicamente y la calidad puede variar entre llamadas.
- El gate editorial humano sigue siendo obligatorio para cualquier resultado de fallback.

#### Evidencia y elección de modelos al 2026-08-01

- Nous expuso 5 modelos `:free`: `inclusionai/ling-3.0-flash`, `poolside/laguna-s-2.1`,
  `poolside/laguna-xs-2.1`, `stepfun/step-3.7-flash` y `tencent/hy3`.
- Smoke real: Step 3.7 y Ling 3.0 respondieron HTTP 200, pero agotaron 300/700 tokens en
  razonamiento sin cumplir el JSON solicitado. No habilitarlos aún como fallback editorial.
- OpenRouter expuso 17 opciones gratuitas. `google/gemma-4-26b-a4b-it:free` y
  `openrouter/free` respondieron HTTP 200 y cumplieron el contrato JSON del smoke.
- La cuenta OpenRouter tiene más de USD 8 de saldo restante; al haber comprado al menos USD 10,
  la documentación vigente indica hasta 1000 solicitudes free/día, sujeto a disponibilidad.

Antes de fijar el modelo, ejecutar un benchmark versionado de 10 casos reales anonimizados:
propuesta, borrador, QA, newsletter, JSON con acentos, rechazo de invención y contenido sensible.
Umbral: 100% de JSON parseable en los fixtures estructurados, cero hechos inventados en fixtures cerrados y
aprobación editorial de 8/10 en tono. Si Gemma no lo alcanza, usar un modelo OpenRouter económico
con presupuesto limitado en lugar de encadenar más modelos free.

#### Cambios y manejo de fallos

- Extraer únicamente un `requestOpenRouterTextCompletion`, paralelo al cliente Nous existente.
- Usar `AbortSignal.timeout` de Node; no agregar dependencia.
- Activar fallback para timeout/red, 404 de modelo, 429, 5xx y 402 del proveedor primario.
- No reintentar silenciosamente 400, 401 o 403: son configuración inválida y deben alertar.
- Registrar proveedor, modelo solicitado/real, latencia, tokens y motivo de fallback; nunca prompt,
  key ni cuerpo generado completo.
- Extender `check-ai-fallback.js` para cubrir:
  1. primario exitoso;
  2. primario Nous falla y secundario Nous responde;
  3. ambos Nous fallan y OpenRouter responde;
  4. auth inválida no entra en bucle;
  5. todos fallan y el error combinado no filtra secretos.
- Agregar un check read-only de disponibilidad que consulte `/models` y confirme los IDs configurados.

Aceptación: los cinco casos pasan; una prueba controlada en producción registra OpenRouter como
fallback y deja la pieza en borrador para revisión.

Referencias:

- [OpenRouter — Free variants](https://openrouter.ai/docs/guides/routing/model-variants/free)
- [OpenRouter — Free Models Router](https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground)
- [OpenRouter — Models API](https://openrouter.ai/docs/api/api-reference/models/get-models)

### Fase 7 — Gate final y despliegue (P0, 0.5 día + 24 h de observación)

- Trabajar cada fase en un commit independiente para rollback selectivo.
- Ejecutar web `astro check` + build, admin test + build y API `test:all`.
- Construir la imagen Docker desde cero y levantarla con una base aislada.
- Desplegar en Dokploy fuera del horario editorial; confirmar migraciones y healthchecks.
- Smoke de producción:
  - portada, secciones, nota, perfil, legales y Estudio;
  - login y permisos por rol;
  - RADAR Perplexity/Firecrawl/Facebook;
  - propuesta -> borrador -> QA -> revisión, sin publicar la pieza de prueba;
  - newsletter doble opt-in;
  - lead comercial;
  - Telegram;
  - fallback OpenRouter controlado.
- Revisar móvil 375 px, tablet 768 px y escritorio 1280 px, consola y red.
- Observar 24 horas: uptime, 5xx, crons, backup, Resend y actividad IA.

Go/no-go:

- **GO**: fases 1–7 aceptadas, sin P0/P1 abierto.
- **NO-GO**: CSP rota, DMARC sin pasar, restore no comprobado, ausencia de alertas o fallback IA no
  controlado. En NO-GO se mantiene el sitio disponible, pero no se inicia difusión/newsletter.

## 4. Dependencias que requieren al propietario

Antes de ejecutar el plan se necesitan decisiones o accesos que no están en el repositorio/VPS:

1. Acceso DNS/Cloudflare para DMARC y redirección `www`.
2. Dirección que recibirá reportes DMARC y alertas de uptime.
3. Destino S3 compatible y credenciales limitadas solo al bucket de backups.
4. Proyecto/DSN de Sentry, si se decide cerrar error tracking antes del lanzamiento.
5. Evidencia o autorización para retirar las métricas `42K`, `+1K` y porcentajes de audiencia.

## 5. Calendario compacto recomendado

| Jornada | Entrega |
|---|---|
| 1 | CSP, scripts y smoke público |
| 2 | DMARC, canonical/redirect, privacidad y corrección editorial |
| 3 | Fallback Nous/OpenRouter y benchmark |
| 4 | Backup S3, restore aislado y monitoreo |
| 5 | Suite completa, deploy y comienzo de observación de 24 h |

El orden puede paralelizar DNS y creación de cuentas externas, pero CSP debe cerrarse antes de hacer
pruebas finales de newsletter y navegación.
