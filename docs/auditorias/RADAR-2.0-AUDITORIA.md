# RADAR 2.0 — Auditoría Técnica y Plan de Implementación

**Proyecto:** CREA Command Center (`/home/karoldelgado/web-dev/creacontenidos`)
**Documento de referencia:** *CREA CONTENIDOS | RADAR 2.0 — Documento de evolución de plataforma*, v1.0
(localizado y leído en `~/Descargas/CREA CONTENIDOS/pagina/CREA_RADAR_2_0_Lineamientos_Karol.docx`; **no está versionado en el repo**)
**Rama auditada:** `master` @ `74b5a3b`
**Fecha:** 4 de septiembre de 2026
**Alcance:** puntos 1–8 de §19 "Prioridades de desarrollo" del documento, numerados 9–16 en el encargo de auditoría.

> **Método.** Toda afirmación de este reporte está anclada a archivo y, cuando aplica, a línea o migración.
> Se distingue explícitamente entre *documentado*, *configurado* (env var) e *implementado y ejecutable*.
> Donde no pude comprobar algo con el código a la vista, dice **NO DETERMINADO**.
> No se modificó ningún archivo del proyecto salvo la creación de este reporte.

---

## 1. Resumen ejecutivo

El diagnóstico del documento RADAR 2.0 es correcto y, en un punto, **conservador**: la plataforma tiene
más construido de lo que el documento asume. Lo que falta no es infraestructura ni pantallas — es una
**capa de análisis editorial entre la verificación y la redacción**, que hoy simplemente no existe: RADAR
verifica una señal y el siguiente paso es "escribir la nota".

Estado real, en una línea por punto:

| # | Punto | Veredicto en una frase |
|---|-------|------------------------|
| 9 | API de señales externas | No existe entrada push; sí existe todo el pipeline de normalización/verificación/dedupe que esa entrada alimentaría. |
| 10 | Grok / agente explorador | Cero código. Grok aparece solo en documentación como "pendiente de evaluar". La abstracción de proveedor tampoco existe. |
| 11 | Motor Editorial CREA | 3 de los 8 campos existen (parcialmente) como texto libre en `topics`; no hay separación entre investigación y renderizado. |
| 12 | CREA Score | No existe. Sí existen `confidence`, `source_count`, `trust` de fuentes y `mentions` — insumos reales para 4 de los 8 factores. |
| 13 | Conversación Digital | No existe, y el dato base tampoco: el scraper de Facebook **descarta** los comentarios y solo guarda su conteo. |
| 14 | Buenos días, Perote | **El módulo ya consume RADAR** (48 h, excluye `risk`, ordena por `confidence`). Falta selección humana y estructura por secciones. |
| 15 | Multiformato | Cada formato se genera por separado con su propia llamada de IA. El patrón "un objeto → N renders" **ya existe y funciona**, pero solo dentro del newsletter. |
| 16 | Feedback editorial | El motivo ya se captura como texto libre obligatorio en rechazo y devolución. Falta tipificarlo y capturarlo también en descartes de RADAR. |

**La brecha de mayor valor no es el descubrimiento externo, es el Motor Editorial (punto 11).**
Sin él, el resto son mejoras cuantitativas: más señales entrando al mismo embudo que hoy salta de
"tema verificado" a "nota redactada". Con él, los puntos 12, 14 y 15 se vuelven casi derivados —
el CREA Score necesita sus campos para calcularse, "PARA ENTENDER" necesita su análisis para existir,
y el objeto editorial maestro **es** el Motor Editorial persistido.

### 1.1 Respuestas directas a las 13 preguntas del encargo

1. **¿Qué parte de RADAR 2.0 ya existe?** La ingesta multi-proveedor (Firecrawl + Perplexity + scraper propio de Facebook),
   la normalización y verificación editorial completa (`confidence`, `verification_status`, `evidence[]`, `risk_flags[]`,
   `source_count`), la lista editorial de fuentes con trust ponderado, el dedupe/merge por similitud, el gate de riesgo
   antes de gastar IA, el pipeline editorial completo con aprobación humana obligatoria, la distribución multicanal con
   bitácora, y "Buenos días, Perote" de punta a punta alimentado por RADAR.
2. **¿Qué parte existe parcialmente?** El Motor Editorial (3 de 8 campos), el formato de señal (10 de 17 campos),
   el multiformato (formatos existen, objeto maestro no), el feedback (texto libre sin taxonomía),
   la priorización (`confidence` ordena, pero mide defensibilidad, no valor editorial).
3. **¿Qué parte falta?** Entrada push de señales, agente explorador, los 5 campos analíticos del Motor Editorial,
   CREA Score, niveles de profundidad, Conversación Digital, relevancia territorial, objeto editorial maestro y sus renders,
   y la selección humana de la edición matutina.
4. **¿Qué ya estaba implementado aunque el documento lo trate como futuro?** Cuatro cosas: (a) **Buenos días, Perote ya
   consume RADAR automáticamente** y ya excluye temas de riesgo — el documento lo plantea como integración pendiente;
   (b) el patrón "un objeto editorial → varios renders" **ya está implementado** en `newsletter-template.js`, exactamente
   como pide §16 del documento; (c) el **registro obligatorio del motivo** de rechazo y devolución ya existe (§17);
   (d) la verificación con confianza, evidencia y banderas de riesgo está completa hasta su fase 6 de calibración,
   con endpoint de métricas y documentación de perillas.
5. **¿Qué debe reutilizarse?** Ver §16 — en resumen: `topic-verification.js` entero, `insertTopicIfNew()` como único punto
   de escritura de señales, `radar_sources` para trust, el gate `force` de `generate-proposal` como patrón de decisión
   asistida, `newsletter-template.js` como plantilla del motor de renders, y `newsletter_editions` como precedente de
   objeto maestro persistido en JSONB.
6. **¿Qué debe modificarse?** `topics` (nuevas columnas mínimas: fecha de evento, localidad, alcance, categoría,
   `external_id`, `provider`), `detectAndSaveTopics()` (extraer el ruteo de proveedor a un registry),
   `newsletter-content.js` (dejar de auto-seleccionar y aceptar una selección editorial),
   `generate-proposal` (leer del objeto maestro en vez del topic crudo).
7. **¿Qué debe desarrollarse desde cero?** Endpoint de ingesta con credencial de máquina, tabla y servicio del Motor
   Editorial, cálculo y persistencia del CREA Score, motor de renders multiformato, y el módulo Conversación Digital.
8. **¿Qué debe investigarse antes?** (a) Cómo obtener comentarios públicos de forma sostenible y legal —bloquea el punto 13;
   (b) viabilidad real de Grok/xAI como explorador (costo, cuota, acceso a X, términos) —bloquea el punto 10;
   (c) si los niveles de profundidad 1/2/3 se deciden por regla, por score o por editor.
9. **¿Cuál es el orden correcto?** 16 → 9 → 11 → 12 → 14 → 15 → 10 → 13. Detalle y justificación en §20.
10. **¿Cuál es el MVP?** Puntos 9 + 11 + 12 + 14 + 16, con un proveedor externo *simulado* (curl/script) en lugar de Grok. Ver §21.
11. **¿Qué riesgos técnicos existen?** Ver §18. Los tres primeros: dependencia de cookies personales de Facebook,
    `topics` como tabla monolítica que ya carga cuatro responsabilidades, y ausencia total de índices en `topics`
    frente a un volumen de ingesta que va a multiplicarse.
12. **¿Qué riesgos editoriales existen?** Presentar muestras de conversación como opinión pública, `mentions`
    (viralidad) influyendo en el orden del boletín, y que un CREA Score alto se lea en la práctica como permiso
    de publicación. Ver §18.4.
13. **¿Cómo debería quedar la arquitectura final?** Ver §15.

---

## 2. Estado actual del proyecto

### 2.1 Forma del repositorio

Monorepo sin workspaces (cada app tiene su propio `package-lock.json`; el `package.json` raíz solo declara
utilidades). 299 archivos versionados.

```
apps/
  api/                 Node 22 + Express 4 (CommonJS). Backend + SSR host del portal + estáticos del panel.
  admin/               SPA TypeScript sin framework, build Vite. Router por hash. 6 365 líneas.
  web/                 Astro SSR (portal público + /estudio).
  competitor-scraper/  Microservicio HTTP Playwright + Chromium (scrape de Facebook con cookies).
docs/                  29 documentos: ADR, auditorías previas, IA, planes, implementaciones.
ops/                   backup_db.sh, check-backup.sh
docker-compose.yml     Postgres + api + competitor-scraper
```

Un solo proceso Express sirve las tres superficies: API en `/api/*`, panel en `/admin` (estático),
portal Astro montado al final como catch-all (`apps/api/src/server.js:140-158`). Decisión deliberada
y documentada en `docs/adr/0001-ia-hibrida-gate-editorial.md`: monolito modular, sin bus de eventos,
comunicación entre capas por transición de estado en tablas compartidas.

### 2.2 Base de datos

42 migraciones SQL aplicadas por `apps/api/src/db/migrate.js` (orden alfabético de nombre de archivo,
registro en `schema_migrations`, cada una en su propia transacción). Tablas relevantes para RADAR 2.0:

| Tabla | Migración | Rol |
|---|---|---|
| `topics` | 002, 013, 023, 024, 034 | Señales detectadas + ficha de verificación + ficha editorial |
| `radar_sources` | 035 | Lista editorial de dominios con `trust` high/medium/low |
| `competitor_posts` | 008 | Publicaciones de competencia (métricas de engagement, sin comentarios) |
| `competitor_facebook_accounts` | 031 | Cuentas a scrapear |
| `content_proposals` | 003, 009, 014, 020, 033, 038 | Pieza editorial en todo su ciclo (propuesta→publicada) |
| `published_content` | 004, 027 | Bitácora de distribución por canal |
| `newsletter_editions` | 019 | Edición diaria de "Buenos días, Perote" (contenido en JSONB) |
| `newsletter_events` | 020 | Agenda comunitaria, carga manual |
| `newsletter_settings` / `editorial_settings` | 018 / 039 | Singletons de configuración |
| `activity_log` | 017 | Bitácora de acciones + `metadata` JSONB (tokens, modelo, proveedor) |
| `story_ideas` | 012 | Bandeja de ideas humanas |
| `social_posts` | 016 | Producciones CREA (embeds propios) |
| `generated_images` | 029 | Portadas IA en BYTEA |
| `telegram_*` | 036 | Estado del bot de aprobación |

`pg_trgm` habilitado (032) — sostiene el dedupe de RADAR y la detección de canibalización.

### 2.3 Proveedores de IA: conectados vs. declarados

**Realmente conectados y en uso (verificado en código, no en `.env`):**

| Proveedor | Uso real | Dónde |
|---|---|---|
| **Perplexity** (`sonar-pro`) | Detección de temas con web viva; detección de competencia | `ai-client.js:220` `perplexitySearch()`, `:246` `detectTopics()`, `:293` `detectCompetitorPosts()` |
| **Nous Portal** | Todo el texto: propuestas, borradores, QA, editorial del newsletter | `ai-client.js:43` `requestNousCompletion()` |
| **OpenRouter** | Fallback de texto **y primario** en 3 rutas de RADAR; imágenes de portada | `ai-client.js:74`, `:266`, `:305`, `:353`, `:391` |
| **Firecrawl** | Scrape de portadas regionales para RADAR | `lib/firecrawl-client.js`, `topic-detection.js:26` |
| **ElevenLabs** | Voz del podcast | `lib/elevenlabs-client.js` |
| **Resend** | Envío del newsletter y doble opt-in | `lib/resend-client.js` |
| **Facebook Graph** | Publicación y sincronización de producciones | `modules/distribution/index.js`, `lib/social-facebook-cron.js` |
| **Telegram** | Aprobación editorial por chat | `modules/telegram/index.js` |
| **wttr.in / open-meteo** | Clima real del newsletter (nunca IA) | `lib/weather-client.js` |

**Declarados pero sin ningún consumidor en código** (confirmado con `grep`): `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `APIFY_API_TOKEN` — presentes en `config.apiKeys` (`config/index.js:96-100`) y en
`.env.example`, leídos por nadie. El propio `README.md` lo declara.

**Grok / xAI: no existe integración de ningún tipo.** `grep -ri "grok\|x\.ai\|xai"` sobre todo el
repo devuelve únicamente menciones en documentación (`docs/ia/CREA_Stack_IA_Actualizado_v1.md:44`:
*"Grok (xAI) para social listening en X | **Pendiente de evaluar**"*). No hay cliente, ni env var,
ni job, ni prompt.

**Claude / Gemini:** solo como modelos accesibles *a través de* OpenRouter/Nous por nombre de modelo
en env var (`AI_MODEL_*`), no como integraciones directas.

### 2.4 Pruebas y CI

`apps/api/scripts/` — 20 checks ejecutables agrupados por `run-checks.js` (unit/public/integration/e2e/all),
disparados en cada push a `master` y en cada PR contra un Postgres efímero (`.github/workflows/ci.yml`).
`check-listening.js` cubre RADAR con 85 asserts (paginación, filtros, summary, bulk delete, radar-stats).

**Brecha declarada por el propio check** (`check-listening.js:374`):
*"happy-path de detección/generación con IA real no cubierto (requiere mock de fetch)"*.
Es decir: **la lógica de normalización/verificación se prueba, pero ninguna llamada a IA tiene prueba de
camino feliz.** Todo lo que se construya para RADAR 2.0 caerá por defecto en esa zona sin cobertura.

E2E de UI con Playwright en `apps/admin/e2e/` (incluye `radar.spec.ts`).

---

## 3. Arquitectura actual

### 3.1 Las cuatro capas

```
apps/api/src/modules/
  listening/      Capa 1 — detección, verificación, fuentes, competencia   715 líneas
  content-engine/ Capa 2 — generación IA con gates previos                 281 líneas
  editorial/      Capa 3 — ideas, pipeline de piezas, aprobación, métricas 412 líneas
  distribution/   Capa 4 — push a canales externos + bitácora              146 líneas
  newsletter/     "Buenos días, Perote" (transversal a las 4)              247 líneas
  public/ social/ auth/ commercial/ telegram/
```

Librerías compartidas relevantes (`apps/api/src/lib/`):

| Archivo | Responsabilidad | Líneas |
|---|---|---|
| `ai-client.js` | Clientes Nous/OpenRouter/Perplexity, cadena de fallback, todos los prompts | 425 |
| `topic-verification.js` | **Núcleo de verificación editorial.** Puro, sin DB | 405 |
| `topic-detection.js` | Orquesta detección, dedupe, merge y persistencia de señales | 311 |
| `newsletter-content.js` | Arma la edición diaria desde RADAR + clima + agenda + patrocinador | 78 |
| `newsletter-template.js` | **3 renderers puros** sobre el mismo objeto de contenido | 131 |
| `editorial-review.js` | `publishProposal` / `returnProposal` — gate editorial compartido API+Telegram | 45 |
| `firecrawl-client.js`, `competitor-scraper-client.js`, `elevenlabs-client.js`, `resend-client.js`, `telegram-client.js`, `weather-client.js` | Adaptadores externos | — |

### 3.2 Jobs programados (`node-cron`, arrancados en `server.js:150-154`)

| Cron | Frecuencia | Qué hace | Lock |
|---|---|---|---|
| `startListeningCron` | cada 6 h | `detectAndSaveTopics()` con query fija de Perote | en memoria |
| `startNewsletterCron` | cada minuto | Genera la edición del día si ya pasó la hora y no existe. **Nunca envía** | en memoria |
| `startSocialFacebookCron` | — | Sincroniza producciones de Facebook | — |
| `startSocialYoutubeCron` | — | Feed RSS de YouTube | — |
| `startTelegramReviewCron` | 08:00 CDMX | Manda pendientes de revisión al director | — |

Ambos locks son `let running = false` en memoria, marcados con comentario `ponytail:` que declara el techo:
solo válido para una instancia.

### 3.3 Autenticación y fronteras de confianza

- Panel/API: JWT (cookie `HttpOnly` + CSRF token, o `Authorization: Bearer`), rol verificado **contra la DB en
  cada request** (`middleware/auth.js:38`), `session_version` para revocación inmediata, 2FA TOTP obligatorio
  para director.
- Máquina a máquina: **existe un solo precedente** — `POST /api/telegram/webhook`, autenticado con
  secreto compartido en header comparado con `crypto.timingSafeEqual` (`modules/telegram/index.js:89-90`).
  Es el patrón a reutilizar para la ingesta de señales.
- El scraper de Facebook vive en red interna de Dokploy, sin exposición pública.
- `express.json({ limit: '100kb' })` global (`server.js:100`).

---

## 4. Evaluación de RADAR actual

RADAR es, con diferencia, el módulo más maduro del sistema. Su plan de desarrollo
(`docs/ia/radar-verificacion-plan.md`) está **completado en sus 6 fases**, con fechas de cierre
registradas en el checklist del propio documento (líneas 465-470).

### 4.1 Lo que hace hoy, verificado

**Ingesta (3 caminos, todos *pull*):**

1. **Firecrawl → Nous/OpenRouter** — `detectViaFirecrawl()` (`topic-detection.js:26`) scrapea las URLs de
   `FIRECRAWL_SOURCE_URLS` (6 portadas regionales por defecto), corta a 8 000 caracteres por URL,
   y pide clasificación con `detectTopicsFromMarkdown()`.
2. **Perplexity Sonar Pro** — fallback automático si no hay key de Firecrawl, no hay URLs, o el scrape falla
   (`topic-detection.js:227-255`). El fallo de Firecrawl se registra en `activity_log.metadata.firecrawl_error`.
3. **Facebook** — `POST /competitors/detect` con `source:'facebook'` delega al microservicio Playwright,
   guarda en `competitor_posts` con dedupe por `post_url`, y **además** convierte los posts en temas de RADAR
   vía `enrichFacebookTopics()` (`listening/index.js:65`). Es best-effort: si la IA falla, el scrape ya quedó.

**Verificación editorial (`topic-verification.js`, puro, testeable):**

- `applyScrapeMultiSource()` (:134) — si el tema cita ≥2 URLs del scrape, sube `source_count` y +10 `confidence`,
  y elimina la bandera `single_source`.
- `applyTrustFromSources()` (:206) — resuelve cada host de `evidence[].url` contra `radar_sources`
  (match más específico gana): `high` +8 (tope +16), `medium` +2 (tope +6), `low` −12 (tope −24) y bandera
  `low_trust_source`. **Si solo hay fuentes `low` y ninguna `high`, un `verified` se degrada a `checking`** —
  el modelo no puede auto-verificarse con redes sociales.
- `normalizeVerification()` (:311) — clamps, derivación de estado por bandas
  (`≥75 verified`, `40-74 checking`, `≤39 risk`), y dos topes duros: `verified` exige ≥2 fuentes independientes
  **o** una primaria; una bandera de riesgo duro (`HARD_RISK_RE`: rumor, clickbait, fake, engagement_bait,
  sin_fundamento, titular_alarmista) fuerza `risk` y capa `confidence` en 39.

**Dedupe y calidad de agenda:** `findRecentSimilarTopic()` (:67) busca en 24 h por título exacto o
`similarity() > 0.45` (pg_trgm). Si existe y el nuevo **no** es mejor (`isBetterTopic`: rank de estado,
luego confianza, luego fuentes) se descarta; si es mejor, hace UPDATE fusionando `evidence` y conservando
el título canónico ya visible en el panel.

**Gate antes de gastar IA** (`content-engine/index.js:41-70`): un tema `risk` responde **409** salvo `force:true`,
y un título similar a una nota ya publicada (`similarity > 0.35`) también. Ambos overrides quedan en
`activity_log` con `forced: true`.

**Calibración** (`GET /api/listening/radar-stats`, `listening/index.js:478`): distribución por estado,
propuestas por estado de verificación, bloqueos del gate, overrides forzados, dedupe, fuentes por trust,
más *hints* de reglas simples y las perillas documentadas con su ubicación en código.

**Panel:** 4 pestañas (Temas / Radar manual / Competencia / Fuentes), ficha de verificación en drawer con
evidencia, banderas y decisión editorial, filtros server-side, paginación con truco `limit+1`, acciones en lote.

### 4.2 Lo que RADAR **no** hace hoy

1. **No recibe nada.** Los tres caminos son *pull*: nuestro cron o nuestro click salen a buscar.
2. **No sabe dónde ni cuándo pasó.** No hay campo de localidad, alcance territorial ni fecha del acontecimiento
   — la fecha vive como prosa dentro de `antecedentes` porque el prompt se lo pide explícitamente
   (`ai-client.js:257`: *"si la fuente no da fecha, dilo explícitamente"*).
3. **No analiza, clasifica.** Produce una ficha de verificación, no un análisis editorial.
4. **No prioriza por valor editorial.** Ordena por `detected_at DESC`; el newsletter ordena por `confidence`,
   que mide *defensibilidad*, no importancia. El propio prompt le dice al modelo:
   *"confidence: defensibilidad del hecho para publicar, **NO copiar viralidad/mentions**"*
   (`topic-verification.js:373`).
5. **`topics.status` (`Nuevo`/`Revisado`) no tiene ningún efecto aguas abajo.** Verificado:
   `generate-proposal` solo consulta `verification_status`; `generateContent()` del newsletter no filtra por
   `status`. El botón "Aprobar" de RADAR es hoy un marcador visual sin consecuencia funcional.
6. **`topics` no tiene ni un solo índice** más allá de la PK (verificado sobre las 42 migraciones).
   `findRecentSimilarTopic` hace `similarity()` sobre el rango de 24 h en *sequential scan*.

---

## 5. Matriz de puntos 9–16

| Punto | Requerimiento RADAR 2.0 | Estado actual | Evidencia en código | Clasificación | Brecha | Recomendación |
|---|---|---|---|---|---|---|
| **9** | Interfaz/API para recibir señales externas | No existe entrada *push*. Las 3 rutas de ingesta son *pull* iniciadas por CREA y exigen JWT de usuario. La normalización, verificación, dedupe y persistencia de señales sí existen y son agnósticas del origen | `modules/listening/index.js:24` (router entero bajo `requireAuth` + rol), `:105` `POST /topics/detect`; `lib/topic-detection.js:112` `insertTopicIfNew()`; `modules/telegram/index.js:89-90` (único patrón de auth máquina-a-máquina) | **REQUIERE DESARROLLO** | Sin endpoint de ingesta, sin credencial de máquina, sin `external_id`/idempotencia, sin contrato de señal versionado. Faltan 7 de 17 campos del formato estándar | Endpoint `POST /api/signals` con API key por proveedor, validación de schema, idempotencia por `(provider, external_id)`, y escritura **exclusiva** vía `insertTopicIfNew()`. Migración aditiva sobre `topics` |
| **10** | Ampliar descubrimiento con Grok Bot como prueba | Cero implementación. Grok solo aparece en documentación como "pendiente de evaluar". No hay abstracción de proveedor: el ruteo Firecrawl→Perplexity está fijo dentro de una función | `grep -ri grok` → solo `docs/ia/CREA_Stack_IA_Actualizado_v1.md:44`; `lib/topic-detection.js:227-255` (cadena hardcodeada); precedente de adaptador externo: `lib/competitor-scraper-client.js` + `apps/competitor-scraper/` | **REQUIERE INVESTIGACIÓN** | Se desconoce costo real, cuota, calidad en español regional, acceso efectivo a X y términos de uso de xAI para reuso editorial | Investigar y **prototipar fuera del API** primero. La arquitectura debe cerrarse en el punto 9 (contrato de señal) para que Grok sea un cliente más de ese endpoint, no una rama dentro de `detectAndSaveTopics()` |
| **11** | Los ocho campos del Motor Editorial CREA | 3 de 8 presentes y parciales, como texto libre en `topics`, generados dentro del mismo prompt de detección. No hay separación investigación/renderizado ni niveles de profundidad | `migrations/013` (`antecedentes`,`actores`,`angulos`,`audiencia`), `migrations/034` (`known_facts`,`unknown_facts`); prompt en `lib/topic-verification.js:370-385`; `lib/ai-client.js:328` `generateProposal()` produce pieza terminada en una sola pasada | **REQUIERE DESARROLLO** | Faltan: por qué importa, qué dicen los datos, implicaciones, qué se está diciendo, qué necesita saber el ciudadano. Falta el objeto analítico como entidad propia y los niveles 1/2/3 | Tabla nueva `editorial_analyses` con FK a `topics` (no más `ALTER TABLE topics`), servicio `editorial-engine.js` con un prompt por nivel, y `generate-proposal` leyendo de ahí en vez del topic crudo |
| **12** | CREA Score 0–100 | No existe. Existen insumos reales para 4 de los 8 factores. La prioridad hoy la da `confidence`, que mide defensibilidad y explícitamente **no** debe reflejar interés | `migrations/034` (`confidence`,`source_count`), `035` (`radar_sources.trust`), `002` (`mentions`); `lib/topic-verification.js:206` (bonos/malus por trust); `lib/newsletter-content.js:50` `ORDER BY COALESCE(confidence,0) DESC, mentions DESC` | **REQUIERE DESARROLLO** | Faltan relevancia local, impacto, implicaciones prácticas y originalidad como factores medibles; falta el cálculo, la persistencia, la exposición y el desglose auditable | Función pura en `lib/crea-score.js` llamada desde `insertTopicIfNew()` (mismo punto que `normalizeVerification`), persistida como `crea_score` + `crea_score_breakdown` JSONB. **Ordena, nunca decide**: sin auto-publicación, sin gate nuevo |
| **13** | Módulo Conversación Digital | No existe, y el insumo tampoco: el scraper **descarta deliberadamente** los bloques de comentarios y solo conserva su conteo numérico | `apps/competitor-scraper/src/facebook.js:25-27` (descarta comentarios anidados), `:72` (solo `commentsRaw` como conteo); `migrations/008` (`comments INTEGER`); `topics.sentiment` es una etiqueta del modelo sobre el tema, no derivada de comentarios | **REQUIERE INVESTIGACIÓN** | No hay forma establecida ni sostenible de obtener texto de comentarios. La vía actual (cookies personales) ya es frágil y no debería ampliarse sin decisión explícita | Investigar primero la adquisición (Graph API sobre página propia vs. terceros vs. no hacerlo). Solo después diseñar el análisis, que **debe** nacer con minimización de datos y nota metodológica obligatoria |
| **14** | Integrar el nuevo flujo con "Buenos días, Perote" | **RADAR ya alimenta el boletín**: temas de 48 h, excluye `risk`, ordena por `confidence` y `mentions`, tope 5. Generación, edición, audio, envío con gate humano y bitácora, todo operativo. Falta selección editorial y estructura por secciones | `lib/newsletter-content.js:43-77` `generateContent()`; `migrations/019` `newsletter_editions`; `lib/newsletter-cron.js` (genera, nunca envía); `modules/newsletter/index.js:107-146` (claim atómico anti-doble-envío); `modules/editorial/index.js:330-372` `GET /pipeline` | **REQUIERE DESARROLLO** | El editor no elige qué entra: la consulta SQL decide. No existen las secciones PEROTE / VERACRUZ-MÉXICO / MUNDO / ECO-TEC-CULT-DEP / PARA ENTENDER. No hay trazabilidad edición↔tema↔nota | Añadir paso de selección (RADAR propone N, editor marca y asigna sección), tabla puente `newsletter_edition_items`, y "PARA ENTENDER" alimentado por un análisis nivel 3. Reutilizar todo lo demás sin tocarlo |
| **15** | Generación multiformato desde una investigación | Cada formato es una fila y una llamada de IA independientes; nada se comparte ni se regenera. **Pero el patrón correcto ya existe y funciona** en el newsletter: un objeto en JSONB y tres renderers puros sobre él | `modules/content-engine/index.js:32-129` (una propuesta por llamada, `format` en el body); `lib/ai-client.js:328` `generateProposal()`; **precedente válido:** `lib/newsletter-template.js` (`renderNewsletterHtml`/`renderNewsletterText`/`renderPodcastScript`) sobre `newsletter_editions.content` | **REQUIERE DESARROLLO** | Sin objeto editorial maestro, sin renderers por canal para notas, sin regeneración ante corrección de un dato. WhatsApp y Facebook hoy son "título + dek + link" | Generalizar el patrón de `newsletter-template.js`: el análisis del punto 11 **es** el objeto maestro; los renders son funciones puras versionadas (`web`, `whatsapp`, `audio`, `newsletter`, `social`) que se pueden reejecutar |
| **16** | Registrar retroalimentación y aprendizaje editorial | El motivo **ya se exige y se guarda** en rechazo de propuesta y devolución de pieza (texto libre obligatorio). Falta tipificarlo, conservar historial y capturarlo en descartes de RADAR | `modules/editorial/index.js:156-171` (`/reject`, motivo obligatorio), `:281-288` (`/return` vía `lib/editorial-review.js:33`), columna `content_proposals.review_comment` (`migrations/014`); `modules/telegram/index.js:80-86` (sí registra en `activity_log`) | **AJUSTE MENOR** | Sin taxonomía de motivos; `review_comment` se sobrescribe (se pierde el historial); `/reject` y `/return` **no** escriben en `activity_log`; los descartes de temas en RADAR no capturan motivo | Añadir `reason_code` con la taxonomía de §17 del documento + registrar cada decisión en `activity_log`; extender el mismo selector a `DELETE /topics/:id`. Es la tarea más barata del backlog y la única cuyo valor **depende de empezar ya** |

---

## 6. Punto 9 — API de señales externas

### 6.1 Qué existe hoy

**No existe ningún endpoint de ingesta.** Las tres formas de que entre una señal a `topics` son:

| Vía | Endpoint / disparo | Auth | Dirección |
|---|---|---|---|
| Detección manual | `POST /api/listening/topics/detect` (`listening/index.js:105`) | JWT usuario, rol `director`/`produccion`, 10 req/10 min por usuario | **pull** — el API sale a buscar |
| Detección automática | `startListeningCron`, cada 6 h, query fija | ninguna (interno) | **pull** |
| Facebook | `POST /api/listening/competitors/detect` con `source:'facebook'` (`:289`) | JWT usuario | **pull** |

En las tres, **CREA decide cuándo buscar y qué buscar**. No hay manera de que un agente externo entregue
un hallazgo.

**Lo que sí existe y es directamente reutilizable** es todo lo que ocurriría *después* de recibir la señal.
`insertTopicIfNew(topicRaw, overrides, options)` (`lib/topic-detection.js:112`) es ya el **punto único de
escritura** usado por los tres caminos, y encadena: refuerzo multi-fuente → trust de dominios → normalización
→ búsqueda de similar en 24 h → INSERT o UPDATE-merge. Un endpoint de ingesta que llame a esta función hereda
verificación, dedupe y merge sin escribir una línea de esa lógica.

**Patrón de autenticación de máquina disponible:** `POST /api/telegram/webhook`
(`modules/telegram/index.js:89-90`) compara un secreto de header con `crypto.timingSafeEqual`, verifica
idempotencia contra la tabla `telegram_updates` por `update_id`, y responde 200 ante duplicado. Es
exactamente la forma que necesita la ingesta de señales.

### 6.2 Comparación campo por campo contra el formato estándar del documento (§7)

| # | Campo RADAR 2.0 | ¿Existe? | Dónde / observación |
|---|---|---|---|
| 1 | ID de señal | **Parcial** | `topics.id` SERIAL interno (`migrations/002`). **No hay id del proveedor** → sin él no hay idempotencia posible |
| 2 | Título provisional | **Sí** | `topics.title` TEXT NOT NULL |
| 3 | Descripción del acontecimiento | **Parcial** | Repartida entre `known_facts` y `antecedentes`; ningún campo es "la descripción" |
| 4 | Fecha y hora de detección | **Sí** | `topics.detected_at` TIMESTAMPTZ DEFAULT now() |
| 5 | **Fecha del acontecimiento** | **No** | Vive como prosa dentro de `antecedentes` por instrucción del prompt (`ai-client.js:257`). **Sin este campo no se puede medir "tiempo de detección"**, una de las métricas de éxito del documento |
| 6 | **Localidad** | **No** | No existe. La geografía solo aparece en el texto de la query manual (`actions.ts:224-243`), que no se persiste |
| 7 | **Alcance territorial** | **No** | No existe. Es el campo que habilitaría "Relevancia para Perote" (§11 del documento) y las secciones PEROTE/VERACRUZ/MUNDO |
| 8 | **Categoría** | **No** en `topics` | Sí existe aguas abajo: `content_proposals.section` con CHECK a 6 valores (`migrations/033`). La categoría se decide al redactar, no al detectar |
| 9 | Fuente original y URL | **Parcial** | `evidence[].label` + `evidence[].url` (`migrations/034`). `topics.source` **no** es la fuente: es el canal (`'Web Search'`, `'Facebook'`) |
| 10 | Tipo de fuente | **Sí** | `evidence[].kind`: `primary`/`secondary`/`social`/`other` |
| 11 | Resumen factual | **Sí** | `topics.known_facts` |
| 12 | Nivel de confianza | **Sí** | `topics.confidence` SMALLINT 0–100 con CHECK de rango |
| 13 | Fuentes corroborantes | **Sí** | `topics.evidence` JSONB + `topics.source_count` + conteo estructural por host (`countIndependentSources`) |
| 14 | Relevancia potencial | **Parcial** | `topics.audiencia` — texto libre, no puntuable |
| 15 | Comentarios disponibles | **Parcial** | `topics.mentions` INTEGER. Para Facebook es engagement real (reacciones+comentarios+compartidos, `listening/index.js:70`); para Firecrawl suele ser 0 |
| 16 | Multimedia disponible | **No** en `topics` | Existe `competitor_posts.media_type` (`migrations/008`), que no se propaga al tema |
| 17 | Estado de verificación | **Sí** | `topics.verification_status` con CHECK a `verified\|checking\|signal\|risk` |

**Resultado: 6 campos completos, 5 parciales, 6 ausentes.** Los seis ausentes son precisamente los que dan
contexto espacial y temporal — y son los que bloquean CREA Score (relevancia local, actualidad),
las secciones del boletín (alcance territorial) y la métrica de tiempo de detección (fecha del acontecimiento).

### 6.3 ¿La arquitectura permite intercambiar proveedor?

**Parcialmente, y por accidente afortunado más que por diseño.**

A favor:
- `insertTopicIfNew()` ya es un punto de escritura único, agnóstico del origen, usado por tres productores distintos.
- `normalizeVerification()` tolera entrada sucia: clampea, deriva estado faltante, descarta URLs inventadas
  (`topic-verification.js:27`: *"No persistir URLs inventadas tipo placeholder"*) y repara JSON malformado
  de modelos débiles (`ai-client.js:182-198`).
- `apps/competitor-scraper/` demuestra que el equipo ya sabe operar un proveedor externo detrás de un
  adaptador HTTP (`lib/competitor-scraper-client.js`), con degradación limpia si no está configurado
  (503 `competitor_scraper_not_configured`).

En contra:
- **No hay registry de proveedores.** `detectAndSaveTopics()` (`topic-detection.js:227-255`) tiene la cadena
  Firecrawl→Perplexity escrita a mano, con variables `provider`/`model`/`metaExtra` construidas inline.
  Añadir un tercer proveedor significa editar esa función, no registrar un adaptador.
- **No hay contrato de señal versionado.** El "formato" es implícito: lo que los prompts piden y
  `normalizeVerification()` tolera.
- **No hay campo de procedencia.** `topics` no registra qué proveedor produjo la señal más allá de
  `source` (un texto de canal). No se puede medir precisión *por proveedor*, que es justo lo que exige
  una prueba de dos semanas con Grok.

### 6.4 Recomendación concreta

1. **Contrato antes que código.** Fijar el schema de señal (los 17 campos) como documento versionado en
   `docs/ia/`, con `schema_version`. Es lo que hace sustituible al proveedor.
2. **Migración aditiva** sobre `topics`: `event_date`, `locality`, `territorial_scope`, `category`,
   `provider`, `external_id`, `media_available`, con índice único parcial `(provider, external_id)
   WHERE external_id IS NOT NULL` para idempotencia. Aditiva y `IF NOT EXISTS`, igual que 034.
3. **`POST /api/signals`** — credencial propia de máquina (tabla `signal_providers` con hash de API key,
   `active`, `trust`), validación estricta del contrato, límite de payload propio (el global es 100 kB),
   aceptación de lote pequeño, y escritura exclusivamente por `insertTopicIfNew()`.
4. **Respuesta explícita por señal**: `inserted` / `upgraded` / `duplicate` / `rejected` + motivo.
   El proveedor necesita saber si su señal sirvió: es el insumo del punto 16 aplicado a proveedores.

---

## 7. Punto 10 — Explorer / Grok Bot

### 7.1 Qué existe hoy

**Nada.** Verificado por búsqueda exhaustiva sobre todo el repositorio (`*.js`, `*.ts`, `*.md`, `*.sql`,
`*.json`, `*.astro`): la única aparición de "Grok" es documental, en
`docs/ia/CREA_Stack_IA_Actualizado_v1.md:44`, tabla de decisiones:

> *"Grok (xAI) para social listening en X | **Pendiente de evaluar.** Se prueba primero con el Web Search /
> RSS del Tool Gateway; si no es suficiente para X/Twitter, se añade como capa adicional en Mes 2."*

Y en `:145`, como pregunta abierta del mes de pruebas. No hay `XAI_API_KEY`, ni cliente, ni job, ni prompt.
**Documentación ≠ implementación**, y aquí ni siquiera hay variable de entorno configurada.

### 7.2 Lo más parecido a un "explorador" que sí existe

| Pieza | Qué aporta al patrón buscado |
|---|---|
| `lib/listening-cron.js` | Un explorador periódico rudimentario: cada 6 h, **una** query fija (`'tendencias y noticias relevantes en Perote, Veracruz, México'`). Descubre poco por diseño |
| `lib/firecrawl-client.js` + `FIRECRAWL_SOURCE_URLS` | Cobertura *fija*: 6 portadas. No descubre fuera de esa lista |
| Radar manual (`actions.ts:218-256`) | Descubrimiento dirigido por humano: tema + zona + categoría + ventana + fuentes → query en lenguaje natural para Perplexity. Es exactamente la rigidez de parámetros que señala §4 del documento |
| **`apps/competitor-scraper/`** | **El precedente arquitectónico más valioso.** Un proveedor externo, fuera de proceso, con contrato HTTP propio (`POST /scrape`, `GET /health`), adaptador dedicado (`lib/competitor-scraper-client.js`), timeout, propagación de `AbortSignal`, y degradación a 503 si no está configurado |

### 7.3 ¿Existe la abstracción `External Intelligence Provider → Signal Adapter → RADAR`?

**No.** Existe la **tercera pata** (RADAR como procesador agnóstico, vía `insertTopicIfNew`) y existe
**un ejemplo suelto** de la primera y la segunda (el scraper de Facebook). Falta la generalización:
un registro de proveedores, un contrato común de entrada y un adaptador por proveedor.

El riesgo concreto de no construirla: si Grok se integra como una rama más dentro de
`detectAndSaveTopics()`, se replica el acoplamiento que ya existe con Firecrawl/Perplexity y el documento
queda incumplido en su punto más explícito (§6: *"RADAR no debe depender de Grok"*).

### 7.4 Qué debe investigarse antes de implementar

1. **Acceso y términos.** ¿Qué producto de xAI da acceso programático a conversación de X, con qué límites
   y con qué permisos de reuso editorial? El documento propone Grok justamente para X, que es la plataforma
   con restricciones más cambiantes.
2. **Costo por señal útil.** Con el histórico ya disponible (`GET /api/content/ai-usage` agrega tokens reales
   de `activity_log`), se puede calcular el costo actual por señal y compararlo. Sin ese número, "ampliar
   descubrimiento" no tiene criterio de éxito.
3. **Calidad en español regional.** Perote es un municipio pequeño; la pregunta no es si Grok resume bien,
   sino si *encuentra algo* sobre Perote que Firecrawl+Perplexity no encuentren. Es medible con una prueba
   ciega de dos semanas comparando señales por proveedor — **y eso exige el campo `provider` del punto 9**.
4. **Modo de operación.** ¿Grok como bot que empuja a `POST /api/signals`, o como servicio que consultamos?
   Empujar es lo que hace sustituible al proveedor y lo que valida el contrato; consultar reintroduce el
   acoplamiento.

**Recomendación:** no escribir código de Grok dentro del API. Prototipar como script externo que llame a
`POST /api/signals` con una API key de proveedor. Si funciona, se queda como worker independiente; si no,
se descarta sin haber tocado el API. Esta es también la forma de cumplir el MVP del documento sin depender
de la investigación: **el MVP puede correr con un proveedor simulado**.

---

## 8. Punto 11 — Motor Editorial CREA

### 8.1 Estado campo por campo

| # | Paso del Motor Editorial | ¿Existe? | Dónde | Observación |
|---|---|---|---|---|
| 1 | **¿Qué pasó?** (hechos, quién, qué, cuándo, dónde, fuentes) | **Parcial** | `topics.known_facts` (`migrations/034`) + `topics.actores` (`013`) + `topics.evidence[]` | Es prosa de 2–4 oraciones, no una estructura. "Cuándo" y "dónde" no son campos: viven dentro del texto |
| 2 | **¿Por qué importa?** | **No** | — | Lo más cercano es `audiencia` ("potencial de audiencia"), que responde *a quién le interesa*, no *por qué importa* |
| 3 | **Contexto** (antecedentes) | **Sí, parcial** | `topics.antecedentes` (`013`) | Texto libre generado en el mismo prompt de detección; no distingue antecedente local/estatal/nacional |
| 4 | **¿Qué dicen los datos?** | **No** | — | Ninguna estadística, serie ni comparación se busca ni se guarda |
| 5 | **Implicaciones** | **No** | — | `angulos` sugiere enfoques de cobertura, que no es lo mismo que implicaciones sociales/económicas/etc. |
| 6 | **¿Qué se está diciendo?** | **No** | — | Solo `mentions` (número) y `sentiment` (una etiqueta del modelo sobre el tema). Depende del punto 13 |
| 7 | **¿Qué no sabemos todavía?** | **Sí** | `topics.unknown_facts` (`034`) | Implementado y pedido explícitamente al modelo (`topic-verification.js:377`) |
| 8 | **¿Qué necesita saber el ciudadano?** | **No** | — | Es el campo con mayor distancia respecto de lo que hoy produce el sistema |

**Marcador: 2 campos presentes (3 y 7), 1 parcial (1), 5 ausentes.**

### 8.2 Dónde se almacenan y quién los genera

- **Almacenamiento:** columnas TEXT sueltas sobre `topics` (migraciones 013 y 034). No hay entidad "análisis":
  el análisis *es* el tema.
- **Generación:** **dentro del prompt de detección**, no en un paso posterior. Los tres detectores
  (`detectTopics` `ai-client.js:246`, `detectTopicsFromMarkdown` `:266`, `enrichFacebookTopics` `:305`)
  piden en la misma llamada: título, sentimiento, antecedentes, actores, ángulos, audiencia **y** el bloque
  de verificación completo (`VERIFICATION_JSON_SPEC`, `topic-verification.js:370`).
- **Consecuencia:** el análisis se hace **una sola vez, para todas las señales, al momento de detectarlas**,
  con el modelo barato y sin haber decidido todavía si el tema merece profundidad. Es lo contrario del
  esquema de tres niveles del documento (§9), donde la profundidad se decide *después* de verificar.

### 8.3 ¿Existe separación entre investigación y renderizado?

**No, y es la brecha estructural del sistema.**

`generateProposal(context, format, angle, competitorPosts, directive)` (`ai-client.js:328`) recibe el tema
crudo y devuelve, **en una sola llamada**, una pieza ya renderizada: `title`, `body`, `dek`, `section`,
`angulo`, `sensibilidad`. La investigación no queda en ningún lado: es un estado intermedio dentro de la
llamada al modelo. Se persiste el resultado, no el razonamiento.

Prueba de que no hay reutilización: generar el mismo tema en formato `nota` y en formato `post` son dos
POST distintos a `/generate-proposal`, dos llamadas de IA, dos filas de `content_proposals` sin relación
entre sí más allá de compartir `topic_id`. Si el editor corrige un dato en la nota, el post no se entera.

**El único lugar del repositorio donde la separación sí existe** es el newsletter (ver §12), y por eso es
el modelo a generalizar, no a reinventar.

### 8.4 Niveles de profundidad (§9 del documento)

No existen. Y hay una **colisión de vocabulario que conviene resolver antes de escribir código**:
`verification_status` ya tiene un valor llamado **`signal`**, que significa *"interés local incompleto,
falta fecha/sede/cifra"* (`topic-verification.js:378`) — es decir, **una señal mal verificada**, no
"una señal que solo merece conocerse" como en el documento. Son ejes distintos:

- Eje A (ya existe): **¿es defendible?** → `verified` / `checking` / `signal` / `risk`
- Eje B (por construir): **¿cuánta profundidad merece?** → nivel 1 / 2 / 3

El plan de verificación ya advirtió sobre no colapsar ejes
(`docs/ia/radar-verificacion-plan.md:84` — *"Dos ejes de 'estado' (no colapsar en uno)"*), y hoy hay un
tercer eje muerto (`topics.status` Nuevo/Revisado, sin efecto aguas abajo). **Recomendación: nombrar el eje
B `analysis_level` (1|2|3) y no usar la palabra "señal" para él.**

### 8.5 Recomendación concreta

1. **Tabla nueva, no más `ALTER TABLE topics`.** `topics` ya carga cuatro responsabilidades (señal cruda,
   ficha de verificación, ficha editorial, ítem de agenda) en ~24 columnas. Proponer
   `editorial_analyses (id, topic_id FK, analysis_level, que_paso JSONB, por_que_importa TEXT,
   contexto TEXT, datos JSONB, implicaciones JSONB, conversacion JSONB, pendientes TEXT,
   relevancia_perote TEXT, para_el_ciudadano TEXT, model, provider, tokens, created_by, created_at)`.
   Esta tabla **es** el objeto editorial maestro del punto 15 — no son dos entregables.
2. **`lib/editorial-engine.js`** con un prompt por nivel: nivel 1 llena 2 campos, nivel 2 llena 4,
   nivel 3 ejecuta los 8. Control de costo por construcción, tal como pide §9 del documento.
3. **Reutilizar la infraestructura de IA existente sin tocarla**: `chatComplete()` con su cadena de fallback
   cross-provider ya resuelta, `parseJson()` con su reparación, y el registro en `activity_log` con tokens
   reales que ya alimenta `GET /api/content/ai-usage`.
4. **Gate de costo**: el análisis nivel 3 se dispara **solo por acción humana** o por CREA Score sobre umbral,
   nunca en el cron de detección. Mismo criterio que ya rige `generate-proposal`
   (`lib/listening-cron.js:1-8`: *"generar propuesta de contenido sigue siendo un click humano"*).
5. **`generate-proposal` pasa a leer del análisis**, no del topic. Es el cambio que convierte la redacción en
   *renderizado* y habilita todo el punto 15.

---

## 9. Punto 12 — CREA Score

### 9.1 Sistemas de puntuación existentes

| Sistema | Dónde | Qué mide | ¿Sirve de base? |
|---|---|---|---|
| `topics.confidence` (0–100) | `migrations/034` + `topic-verification.js:311` | **Defensibilidad para publicar.** El prompt es explícito: *"NO copiar viralidad/mentions"* (`:373`) | **Sí, como un factor** — nunca como el score. Mide otra cosa |
| `topics.source_count` | `034` + `countIndependentSources()` (`:91`) | Fuentes independientes por host/label, con piso estructural aunque el modelo subreporte | **Sí, directo** — es el factor "cantidad de fuentes" |
| `radar_sources.trust` | `035` + `applyTrustFromSources()` (`:206`) | Calidad del dominio: high +8 (tope +16), medium +2 (tope +6), low −12 (tope −24) | **Sí, directo** — es el factor "calidad de fuentes", **ya con ponderación calibrada y probada** |
| `topics.mentions` | `002` | Interés estimado. En Facebook = reacciones+comentarios+compartidos reales (`listening/index.js:70`); en Firecrawl suele 0 | **Parcialmente** — proxy débil y sesgado hacia Facebook |
| `verificationRank` / `isBetterTopic` | `topic-verification.js:271-290` | Orden de calidad para decidir merge en el dedupe | **Sí, como patrón**: ya existe una noción de "cuál tema es mejor" |
| Canibalización | `content-engine/index.js:57-68` | `similarity(title) > 0.35` contra publicadas | **Sí, invertido**: hoy es un portón; como factor sería "originalidad" |
| `story_ideas.score` NUMERIC(3,1) | `012` | Score de idea humana | **No** — nunca se calcula, solo se muestra si alguien lo carga a mano |
| `qaCheck().score` | `ai-client.js:366` | Calidad de redacción 0–100 | **No** — es post-redacción, y ni siquiera se persiste (solo va a `activity_log`) |

**Prioridad efectiva hoy:** la única que existe está en el newsletter —
`ORDER BY COALESCE(confidence, 0) DESC, mentions DESC LIMIT 5` (`lib/newsletter-content.js:50-51`).
Es decir: **el boletín matutino se ordena por defensibilidad y se desempata por viralidad**. Ninguna de
las dos es valor editorial, y la segunda es justo lo que el documento pide no confundir. En el panel de
RADAR el orden es `detected_at DESC` — cronológico puro.

### 9.2 Los ocho factores propuestos

| Factor | ¿Existe insumo? | Detalle |
|---|---|---|
| Relevancia local | **No** | No hay campo de localidad ni de alcance territorial. **Bloqueado por el punto 9** |
| Impacto potencial | **No** | Ningún campo lo aproxima |
| Actualidad | **Parcial** | `detected_at` sí; **fecha del acontecimiento no**. Hoy solo se puede medir "qué tan reciente lo vimos", no "qué tan reciente es". **Bloqueado por el punto 9** |
| Número y calidad de fuentes | **Sí, completo** | `source_count` + `evidence[].kind` (`primary` pondera) + `evidence[].reliable` + `radar_sources.trust` con pesos ya calibrados |
| Interés ciudadano | **Parcial** | `mentions`, sesgado a Facebook y ausente en Firecrawl |
| Implicaciones prácticas | **No** | **Bloqueado por el punto 11** (campo 5 del Motor Editorial) |
| Conversación detectada | **Parcial** | Solo el conteo `mentions`. El contenido de la conversación **está bloqueado por el punto 13** |
| Originalidad del tratamiento | **Parcial e invertido** | La similitud contra publicadas ya se calcula (`similarity > 0.35`), pero como bloqueo binario, no como gradiente |

**1 factor completo, 4 parciales, 3 ausentes.** Y tres de ellos dependen de otros puntos —
razón por la cual el CREA Score **no puede ir primero** en el orden de implementación (§20).

### 9.3 Diseño recomendado

**Dónde se calcula.** Función pura en `lib/crea-score.js`, invocada desde `insertTopicIfNew()`
(`topic-detection.js:112`) justo después de `normalizeVerification()`. Es el mismo punto donde ya se
resuelve trust y multi-fuente, corre para las tres vías de ingesta sin duplicar código, y al ser pura se
prueba sin base de datos — igual que `topic-verification.js`, que es el único módulo del proyecto con esa
propiedad y no es casualidad que sea el más sólido.

**Si se persiste.** Sí, dos columnas: `crea_score SMALLINT CHECK (0..100)` y
`crea_score_breakdown JSONB`. El desglose no es opcional: un score sin explicación no es auditable y el
editor no puede discutirlo. Ya existe el precedente de guardar el porqué junto al qué
(`evidence[]`, `risk_flags[]`, `editorial_decision`).

**Recálculo.** El score debe recalcularse cuando el tema se enriquece — `insertTopicIfNew` ya reconoce
ese momento (`_action: 'upgraded'`) y ya re-normaliza con la evidencia fusionada. Enganchar ahí es una línea.

**Cómo se expone.** Añadir `crea_score` al SELECT de `GET /api/listening/topics` (`listening/index.js:145`),
un orden opcional `?order=score`, bandas en `GET /topics/summary`, y la lectura del documento
(80–100 prioridad alta / 60–79 requiere contexto / <60 permanece como señal) como **etiqueta visual**
en el panel.

**Cómo afecta la priorización sin decidir.** Tres reglas que respetan el principio del documento:

1. **Ordena, no filtra.** Ningún tema desaparece de RADAR por score bajo. El precedente correcto es
   `risk`, que se muestra igual y solo exige `force` (`content-engine/index.js:41-56`).
2. **Sugiere nivel de análisis, no publicación.** El score alto propone análisis nivel 3; el editor decide.
3. **Nunca dispara redacción ni envío automáticos.** Se mantiene lo que ya es política verificada en código:
   el cron de RADAR solo detecta, el cron del newsletter solo genera y nunca envía
   (`lib/newsletter-cron.js:1-5`), y publicar exige `director` + `origin` explícito
   (`lib/editorial-review.js:16-23`).

**Ojo con el sesgo que ya existe:** si `mentions` entra al score con peso alto, se amplifica el sesgo hacia
Facebook (único origen con engagement real) y se reintroduce la viralidad en la agenda por la puerta de atrás.
Recomendación: peso bajo, tope explícito, y registrarlo en el desglose para poder auditarlo desde el día uno.

---

## 10. Punto 13 — Conversación Digital

### 10.1 Qué existe hoy

| Pieza | Qué guarda | Qué **no** guarda |
|---|---|---|
| `competitor_posts` (`migrations/008`) | `post_text`, `source_account`, `post_date`, `reactions`, `comments`, `shares`, `views`, `media_type` | **Ningún comentario.** `comments` es un INTEGER: el conteo |
| `apps/competitor-scraper/src/facebook.js` | Posts de páginas de Facebook | **Descarta los comentarios deliberadamente**: las líneas 25-27 documentan que Facebook anida bloques de comentarios dentro del `[role="article"]` del post y que el scraper conserva *solo los `article` externos* para no tratar un comentario como si fuera un post |
| `topics.sentiment` | Etiqueta `positivo`/`negativo`/`neutral` | Es una valoración **del modelo sobre el tema**, no un agregado de opiniones reales |
| `topics.mentions` | Suma de engagement para temas de Facebook (`listening/index.js:70`) | Un número, sin desglose ni contenido |
| `social_posts` (`016`) | Embeds de **producciones propias** de CREA (TikTok/YouTube/Facebook) | No es listening; es publicación |

**Conclusión: no existe ningún dato de conversación reutilizable.** No es que falte el análisis: falta
el insumo. El proyecto tiene métricas de conversación (cuántos), no conversación (qué dicen).

Tampoco existe nada de: temas recurrentes, dudas frecuentes, preocupaciones, críticas, apoyos, desacuerdos,
afirmaciones a verificar ni preguntas sin respuesta.

### 10.2 Por qué esto es REQUIERE INVESTIGACIÓN y no REQUIERE DESARROLLO

La parte de análisis es directa: dado un corpus de comentarios, pedirle a un modelo que agregue por
categorías es exactamente lo que ya hace `enrichFacebookTopics()` sobre texto ya recolectado.
**El problema es la adquisición**, y tiene tres frentes sin resolver:

1. **Vía técnica.** La Graph API permite leer comentarios de la **página propia** con permisos adecuados
   (`FACEBOOK_PAGE_ID` + `FACEBOOK_PAGE_ACCESS_TOKEN` ya existen y se usan para publicar en
   `modules/distribution/index.js:76-92`). Para páginas de terceros no hay vía oficial.
2. **Vía actual, y su fragilidad.** Ampliar el scraper de cookies a comentarios profundiza una dependencia
   que ya es el mayor riesgo operativo del sistema: cookies de sesión personal que caducan cada 30–90 días,
   con rotación manual documentada en `apps/competitor-scraper/README.md`. Multiplicar por N el volumen
   scrapeado multiplica la probabilidad de bloqueo.
3. **Legal y de producto.** Recolectar comentarios de terceros es tratamiento de datos de personas
   identificables. El documento **ya da la respuesta correcta** ("interesa lo que se dice, no quién lo dice";
   *analizar → categorizar → agregar → descartar identidad*), pero eso debe ser una restricción de diseño
   desde el schema, no un filtro añadido después.

### 10.3 Arquitectura recomendada (cuando la investigación desbloquee)

**Modelo de datos con minimización desde el origen:**

- **No** crear una tabla de comentarios individuales con autor. Es la decisión que después no se puede
  deshacer.
- `conversation_analyses (id, topic_id FK, period_start, period_end, sources JSONB,
  posts_analyzed INT, comments_analyzed INT, recurring_themes JSONB, questions JSONB, concerns JSONB,
  criticisms JSONB, support JSONB, disagreements JSONB, claims_to_verify JSONB, unanswered JSONB,
  method_note TEXT, model, provider, created_at)` — se guarda **el agregado**, no el corpus.
- Si hace falta conservar citas textuales, guardarlas sin autor, sin URL de perfil y sin identificador,
  con longitud acotada. `normalizeEvidence()` (`topic-verification.js:17`) ya demuestra el patrón de
  saneamiento con topes de longitud.
- El corpus crudo se procesa en memoria y se descarta. Si por costo hiciera falta cachearlo, con TTL
  corto y borrado garantizado.

**Salvaguardas editoriales obligatorias (no opcionales):**

1. `method_note` **NOT NULL** con el texto del documento: *"Este análisis corresponde a comentarios públicos
   observados en redes sociales y no constituye una encuesta ni representa estadísticamente la opinión de la
   población."* Si el campo es obligatorio en la tabla, ningún render puede omitirlo por descuido.
2. Mostrar siempre `posts_analyzed` y `comments_analyzed` junto a cualquier distribución.
3. Prohibir porcentajes bajo un mínimo de muestra. Precedente en el código: el panel de métricas devuelve
   `socialChannels: []` y `totalReach: null` a propósito, *"en vez de simular números"*
   (`modules/editorial/index.js:376-378`). Esa honestidad ya es política del proyecto; extenderla aquí.
4. `claims_to_verify` no es contenido publicable: es una **entrada de trabajo** para verificación, y debe
   conectarse con `risk_flags` del tema, no con la nota.

**Encaje en el sistema:** este análisis es el campo 6 del Motor Editorial ("¿Qué se está diciendo?") y el
factor "conversación detectada" del CREA Score. **No es un módulo aparte**: es un proveedor de un campo.
Diseñarlo como módulo independiente duplicaría la ficha editorial.

---

## 11. Punto 14 — Buenos días, Perote

### 11.1 Cómo funciona hoy, verificado paso a paso

**Origen de las noticias — RADAR, ya conectado.** `generateContent()` (`lib/newsletter-content.js:43-51`):

```sql
SELECT title, sentiment, antecedentes, angulos FROM topics
WHERE detected_at >= now() - interval '48 hours'
  AND (verification_status IS NULL OR verification_status <> 'risk')
ORDER BY COALESCE(confidence, 0) DESC, mentions DESC
LIMIT 5
```

Es decir: **el boletín ya se alimenta de RADAR, ya excluye temas de riesgo y ya prioriza por confianza.**
Si no hay temas en 48 h, falla con 409 y mensaje explícito (*"Corre RADAR primero"*). El documento trata
esta integración como pendiente; **está hecha**.

**Cómo se generan las ediciones.**

| Elemento | Fuente | ¿IA? |
|---|---|---|
| `notaDelDia {titulo, cuerpo}` | Los 5 temas de RADAR | Sí — `generateNewsletterEditorial()` (`ai-client.js:378`), modelo barato, tope 400 palabras, sin emojis, sin clickbait |
| `enBreve[]` (2–4) | Los mismos temas | Sí |
| `datoDelDia` | Conocimiento del modelo sobre Perote | Sí, con instrucción de no inventar |
| `clima` | **Datos reales**, `lib/weather-client.js` | **No, por diseño explícito**: *"El clima NUNCA pasa por acá — se arma con datos reales para no dejar que el modelo invente temperaturas"* |
| `agenda` | `newsletter_events`, carga manual | **No** — *"nunca se inventa un evento"* (`migrations/020`) |
| `patrocinador` | `clients` con `pipeline_stage='cerrado'`, rotación por `last_sponsored_at`, link descartado si no tiene esquema válido | **No** |
| `guionPodcast` | Derivado del contenido por `renderPodcastScript()`, **editable por separado** | No (render puro) |

**Persistencia:** `newsletter_editions` (`migrations/019`) — una fila por día (`UNIQUE(edition_date)`),
contenido completo en JSONB, `status` `pendiente`→`enviado`, `sent_by`.

**Automatización:** `newsletter-cron.js` corre cada minuto, genera si ya pasó la hora configurada
(`newsletter_settings`) y no existe edición de hoy. Es autocorrectivo: si la IA falla en el minuto exacto,
reintenta al siguiente. **Solo genera; nunca envía.**

**Dónde interviene el editor.**

| Acción | Endpoint | Rol |
|---|---|---|
| Generar bajo demanda | `POST /api/newsletter/generate` | director / produccion |
| Ver pendiente | `GET /api/newsletter/pending` | director / produccion |
| **Editar** contenido y guion | `PATCH /api/newsletter/pending` | director / produccion |
| Previsualizar HTML+texto | `POST /api/newsletter/preview` | director / produccion |
| **Enviar** | `POST /api/newsletter/send` | director / produccion |
| Generar audio | `POST /api/newsletter/audio` | director / produccion, tope 5/15 min |
| Agenda (alta/baja) | `/api/newsletter/events` | director / produccion |

El envío tiene **claim atómico** contra doble envío (`modules/newsletter/index.js:112-120`): un UPDATE
condicional reclama la edición antes de llamar a Resend, y si el broadcast falla libera el claim.
Doble clic o dos directores simultáneos → 409, no dos correos.

**Visibilidad:** `GET /api/editorial/pipeline` (`modules/editorial/index.js:330`) deriva 6 pasos reales
(listening, borrador, clima, aprobación, audio, envío) desde `topics`, `newsletter_editions` y
`activity_log` — no son estados simulados.

### 11.2 Comparación con el modelo propuesto

| Sección propuesta | ¿Existe? | Observación |
|---|---|---|
| **PEROTE** — lo verdaderamente importante | Parcial | `notaDelDia` cumple la función, pero no es una sección territorial: es "la más relevante de las 5 detectadas" |
| **VERACRUZ / MÉXICO** | **No** | La detección es Perote-céntrica por query fija. Y sin `territorial_scope` (punto 9) no hay cómo clasificar |
| **MUNDO** | **No** | No hay ninguna fuente de agenda nacional/internacional configurada |
| **ECONOMÍA / TECNOLOGÍA / CULTURA / DEPORTES** | **No** en el boletín | La taxonomía existe aguas abajo (`content_proposals.section`, `migrations/033`) pero no se aplica a temas ni a ítems del boletín |
| **PARA ENTENDER** | **No** | Requiere un análisis de profundidad — **bloqueado por el punto 11** |

### 11.3 Las tres brechas reales

1. **El editor no selecciona.** Esta es la brecha central respecto del flujo objetivo
   (*"RADAR propone → editor selecciona → Buenos días, Perote genera"*). Hoy la selección la hace un
   `ORDER BY ... LIMIT 5`. El editor puede reescribir el texto resultante, pero no puede decir
   "estos tres sí, este no, este va en MUNDO". Es un cambio de flujo, no de redacción.
2. **No hay trazabilidad edición ↔ tema ↔ nota.** `newsletter_editions.content` guarda `topicsUsed`
   como **número**. No hay FK, no hay ids. Consecuencias medibles: no se puede responder "¿de qué señal
   salió esto?", no se puede medir tiempo de detección→publicación por ítem, y no se puede evitar que
   el boletín repita algo que ya salió como nota en el sitio.
3. **El boletín es una rama paralela al pipeline editorial.** Lee `topics` directamente y **nunca toca
   `content_proposals`**. Una nota web y un ítem de boletín sobre el mismo hecho son dos textos generados
   por separado, sin relación en la base. Es exactamente la duplicación de investigación que denuncia
   §16 del documento — y ocurre hoy, dentro de casa, sin necesidad de proveedores externos.

### 11.4 Recomendación

Conservar **todo** lo construido (generación, edición, clima real, agenda, patrocinador, audio, claim de
envío, cron, pipeline). Añadir tres cosas:

1. **Paso de selección.** Nueva pantalla o pestaña: RADAR propone los N temas mejor puntuados (CREA Score),
   el editor marca los que entran y les asigna sección. `generateContent()` cambia su firma para aceptar una
   selección; **si no recibe ninguna, conserva el comportamiento actual** — así el cron sigue funcionando y
   nada se rompe mientras se adopta el flujo nuevo.
2. **Tabla puente `newsletter_edition_items (edition_id, topic_id, analysis_id, section, position)`**.
   Resuelve la trazabilidad y habilita las métricas del documento.
3. **"PARA ENTENDER" = un análisis nivel 3.** Es el enganche natural entre el punto 11 y el producto piloto,
   y la prueba de que el Motor Editorial produce algo que el sistema anterior no podía producir.

---

## 12. Punto 15 — Multiformato

### 12.1 Capacidad actual por formato

| Formato | ¿Existe? | Cómo se produce hoy |
|---|---|---|
| **WEB** | **Sí** | `content_proposals` con `status='published'` leída por el portal Astro (`apps/web/src/pages/notas/[slug].astro` vía `modules/public/index.js:27,55`). Con slug, dek, sección, portada, JSON-LD, `view_count` |
| **WHATSAPP** | **Sí, mínimo** | `POST /api/distribution/whatsapp` (`modules/distribution/index.js:96-105`): arma `título + dek + url` y devuelve un link `wa.me`. No es Business API, y no es un texto pensado para WhatsApp: es la nota reducida |
| **AUDIO** | **Sí, solo newsletter** | `renderPodcastScript()` → ElevenLabs (`lib/elevenlabs-client.js`) → mezcla con cortinillas fijas (`lib/podcast-audio.js`). **Solo para el boletín**; una nota no tiene versión en audio |
| **NEWSLETTER** | **Sí, completo** | `renderNewsletterHtml()` + `renderNewsletterText()` sobre `newsletter_editions.content`, envío por Resend |
| **SOCIAL** | **Sí, mínimo** | `POST /api/distribution/facebook`: `message = title + '\n\n' + dek`, con link. No hay carrusel, ni "5 cosas que necesitas saber", ni pieza social generada |
| *(guion_video, meme)* | Parcial | Existen como valores de `format` en `content_proposals`; el meme aparece en el README del módulo pero no en el selector del panel (`screens/radar.ts:129`: nota, post, guion_audio, guion_video) |

### 12.2 ¿Se reutiliza la investigación?

**Para notas: no.** Cada formato es un `POST /api/content/generate-proposal` distinto con su propio
`format`, su propia llamada a `generateProposal()` (`ai-client.js:328`) y su propia fila en
`content_proposals`. Comparten `topic_id` y nada más. Si el editor corrige un dato en la nota, el post
generado antes conserva el dato viejo y nadie se entera. **Es literalmente el escenario que el documento
describe como "cinco investigaciones independientes".**

**Para el newsletter: sí, y correctamente.** `newsletter_editions.content` es un objeto único
(weekday, date, clima, notaDelDia, enBreve, datoDelDia, agenda, patrocinador, guionPodcast) y
`lib/newsletter-template.js` expone **tres funciones puras** que lo renderizan a HTML de correo, texto
plano y guion hablado. El audio se produce del tercer render. Editar el objeto (`PATCH /pending`) y
volver a renderizar es la operación normal.

**El patrón que pide el documento ya está implementado, probado en producción y sirviendo a lectores
reales — pero solo dentro del boletín.** El trabajo del punto 15 no es inventar arquitectura: es
generalizar `newsletter-template.js` al resto del sistema.

### 12.3 Contraste con la arquitectura propuesta

| Componente propuesto | Estado | Equivalente actual más cercano |
|---|---|---|
| MASTER EDITORIAL OBJECT | **No existe** para notas | `newsletter_editions.content` (solo boletín) — y `editorial_analyses` del punto 11 **es** este objeto |
| ├ hechos | Parcial | `topics.known_facts` |
| ├ fuentes | **Sí** | `topics.evidence[]` (con label, url, kind, supports, reliable) |
| ├ contexto | Parcial | `topics.antecedentes` |
| ├ datos | **No** | — |
| ├ implicaciones | **No** | — |
| ├ conversación | **No** | — |
| ├ pendientes | **Sí** | `topics.unknown_facts` |
| ├ relevancia | Parcial | `topics.audiencia` |
| ├ CREA Score | **No** | — |
| └ estado editorial | **Sí** | `topics.verification_status` + `content_proposals.status` |
| WEB_RENDER | Implícito | El portal renderiza `content_proposals` directo. No hay función de render aislada |
| WHATSAPP_RENDER | Trivial | 3 líneas dentro de `distributeHandler` |
| AUDIO_RENDER | **Sí, aislado** | `renderPodcastScript()` — el ejemplo correcto |
| NEWSLETTER_RENDER | **Sí, aislado** | `renderNewsletterHtml` / `renderNewsletterText` |
| SOCIAL_RENDER | Trivial | `title + dek` dentro del handler de Facebook |

### 12.4 Recomendación

1. **El objeto maestro no es una entidad nueva: es `editorial_analyses` del punto 11.** Construir ambos como
   una sola cosa evita el peor resultado posible, que es tener dos objetos "maestros" compitiendo.
2. **`lib/renders/` con funciones puras**, una por canal, con la misma disciplina que `newsletter-template.js`:
   sin acceso a base de datos, sin llamadas a IA cuando no hagan falta, entrada = objeto maestro,
   salida = string. Se prueban sin infraestructura.
3. **Regeneración explícita.** Guardar en cada render el `analysis_id` y su `version`. Si el análisis cambia,
   los renders quedan marcados como desactualizados y el editor decide regenerar — nunca automático sobre algo
   ya publicado, porque publicar es la puerta editorial y no puede saltarse.
4. **WhatsApp y Social merecen render propio, no la nota recortada.** Es la diferencia entre distribuir
   y empaquetar, y es donde el documento pone el valor.
5. **Reutilizar el flujo de aprobación tal cual.** Un render no es una publicación: `content_proposals`
   y su gate siguen siendo la puerta. Los renders son las salidas de una pieza ya aprobada.

---

## 13. Punto 16 — Feedback y aprendizaje editorial

### 13.1 Qué se registra hoy

| Decisión humana | ¿Se pide motivo? | Dónde se guarda | ¿Queda en bitácora? |
|---|---|---|---|
| **Rechazar propuesta IA** | **Sí, obligatorio** — 400 si viene vacío (`modules/editorial/index.js:161-163`) | `content_proposals.review_comment` (texto libre) | **No** |
| **Devolver pieza en revisión** | **Sí, obligatorio** (`lib/editorial-review.js:33`) | `content_proposals.review_comment` (sobrescribe) | **No** |
| Devolver desde Telegram | **Sí** (mensaje de texto en el chat) | `review_comment` | **Sí** — `activity_log` `telegram_return` con el comentario (`modules/telegram/index.js:84`) |
| **Modificar** en el editor | No | El cambio se guarda; el motivo no existe | No |
| **Publicar** | Se exige `origin` (100% humano / Asistido por IA / Generado con IA) | `content_proposals.origin` | No (sí en Telegram) |
| **Descartar tema en RADAR** | **No** | Nada | Parcial — `radar_delete` con el título, sin motivo (`listening/index.js:258`) |
| **Descartar temas en lote** | **No** | Nada | `radar_batch_delete` con los ids |
| Forzar propuesta sobre `risk` | Implícito (`force:true`) | — | **Sí** — `activity_log` con `forced:true` y `verification_status` |
| Bloqueo del gate de riesgo | — | — | **Sí** — `reason: 'verification_risk'` |

**Lo bueno, y es más de lo que el documento asume:** exigir motivo en rechazo y devolución **ya es política
aplicada en código**, no una intención. Y `radar-stats` ya explota los overrides forzados como señal de
calibración (`listening/index.js:588-599`, hint: *"Se forzó propuesta desde risk N veces: revisar si el gate
es demasiado estricto"*). Ese hint es, en pequeño, exactamente el aprendizaje editorial que pide el documento.

### 13.2 Las cuatro brechas

1. **Sin taxonomía.** Todo es prosa. Los diez motivos del documento (dato incorrecto, fuente insuficiente,
   poca relevancia, enfoque incorrecto, tono, falta contexto, interpretación excesiva, duplicado, tema viejo,
   otro) no existen como valores. **Sin códigos no hay dataset: hay comentarios.**
2. **Historial destruido.** `review_comment` es **una** columna que se sobrescribe. Una pieza devuelta tres
   veces conserva solo el último motivo. Los dos primeros aprendizajes se pierden.
3. **Rechazo y devolución no van a `activity_log`.** Verificado: en `modules/editorial/index.js` el único
   `logActivity` es el de `proposal_delete` (:308). Paradójicamente, **la vía de Telegram sí registra**
   (`telegram_return`), así que el mismo acto queda auditado o no según por dónde entre.
4. **Los descartes de RADAR no capturan nada.** Y es la decisión más frecuente del día: según el propio
   ejemplo del documento, de 63 señales se descartan 41. Esas 41 decisiones son la materia prima más
   abundante del criterio editorial de CREA, y hoy se tiran.

### 13.3 Por qué es AJUSTE MENOR y por qué debe hacerse primero

El cambio es aditivo y pequeño:

- Migración: `content_proposals.review_reason_code TEXT` (sin CHECK rígido al inicio, para poder ajustar
  la taxonomía sin migración; validar en la capa de aplicación como ya se hace con `SECTIONS` en
  `modules/editorial/index.js:186-188`).
- Dos `<select>` en el panel (modal de devolución en `screens/aprobacion.ts:36-40`, rechazo en
  `screens/propuestas.ts:26-28`) y uno en el drawer de RADAR.
- Una llamada a `logActivity()` en `/reject`, `/return`, `DELETE /topics/:id` y el batch — con
  `reason_code`, `topic_id`/`proposal_id`, `verification_status` y `crea_score` cuando exista.
  El historial completo vive en `activity_log`, que ya es append-only y ya tiene `metadata` JSONB.

**Y debe ir primero por una razón que no tiene que ver con su tamaño:** es el único entregable cuyo valor
depende del tiempo transcurrido. Un dataset de criterio editorial que empieza a llenarse en el mes 1 vale
mucho más que uno perfecto que empieza en el mes 4. Todo lo demás se puede construir después sin perder nada;
esto no.

### 13.4 Cómo se convierte en aprendizaje

Con `reason_code` en `activity_log`, sin ninguna infraestructura de ML:

| Uso | Consulta / mecanismo |
|---|---|
| **Prompts** | Agregar los motivos más frecuentes del último mes y usarlos como reglas negativas en `directiveBlock()` (`ai-client.js:177`), que **ya existe** y ya antepone directrices al prompt |
| **Scoring** | Correlacionar `crea_score` con la tasa de descarte por banda. Si los 80-100 se descartan tanto como los 40-60, el score está mal ponderado |
| **Detección** | `reason_code = 'duplicado'` frecuente → bajar el umbral de similitud (hoy 0.45, ya documentado como perilla en `docs/ia/radar-calibracion.md`) |
| **Priorización** | `'poca relevancia'` concentrado en una fuente → revisar su `trust` en `radar_sources` |
| **Generación** | `'tono'` / `'interpretación excesiva'` frecuentes → ajustar el system prompt de `generateProposal` |

Extender `GET /api/listening/radar-stats` con estos agregados es lo natural: ese endpoint **ya** existe para
esto y ya emite hints de reglas simples. No hace falta un módulo de analítica.

---

## 14. Flujo actual

Reconstruido desde el código, no desde la documentación. Cada bloque cita su implementación.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [A] DESCUBRIMIENTO  —  los tres caminos son PULL: CREA sale a buscar             │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  cron 6h ──────────► detectAndSaveTopics(query fija)      lib/listening-cron.js   │
│                        │                                                         │
│  click "Radar manual" ─┤  query armada en el navegador     actions.ts:218-256     │
│  (tema+zona+categoría+ │  (los parámetros NO se persisten)                        │
│   ventana+fuentes)     │                                                          │
│                        ├─► Firecrawl (6 portadas fijas) ──► detectTopicsFromMarkdown│
│                        │      FIRECRAWL_SOURCE_URLS          (OpenRouter → Nous)  │
│                        └─► si falla o no hay key ──────────► Perplexity sonar-pro │
│                                                              topic-detection.js:227│
│  click "Escanear FB" ─► competitor-scraper (Playwright + cookies personales)      │
│                          └─► competitor_posts ──► enrichFacebookTopics()          │
│                                (dedupe por post_url)      listening/index.js:65   │
│                                                                                  │
│  ✗ NO EXISTE: entrada push. Ningún agente externo puede entregar un hallazgo.     │
└───────────────────────────────────┬──────────────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [B] NORMALIZACIÓN + VERIFICACIÓN     lib/topic-verification.js  (puro, sin DB)   │
│      applyScrapeMultiSource  →  applyTrustFromSources(radar_sources)              │
│                              →  normalizeVerification                            │
│      produce: confidence 0-100 · verification_status · evidence[] · risk_flags[]  │
│               source_count · editorial_decision                                   │
└───────────────────────────────────┬──────────────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [C] DEDUPE / MERGE  (24 h · título exacto o similarity > 0.45 · pg_trgm)         │
│      mejor → UPDATE con merge de evidence   ·   igual o peor → descartado         │
│                                              topic-detection.js:112               │
│                        ══════► topics ◄══════                                     │
│      ✗ topics no tiene ningún índice. ✗ sin fecha de evento, localidad, alcance.  │
└───────────────────────────────────┬──────────────────────────────────────────────┘
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [D] RADAR (panel)   Temas │ Radar manual │ Competencia │ Fuentes │ Calibración   │
│      orden: detected_at DESC          ficha de verificación en drawer             │
│      humano: Aprobar (status='Revisado', SIN EFECTO aguas abajo) · Eliminar ·     │
│              Generar propuesta                                                    │
│                                                                                  │
│  ✗ NO EXISTE: análisis editorial. Se salta de "verificado" a "escribir".          │
│  ✗ NO EXISTE: CREA Score. ✗ NO EXISTE: nivel de profundidad.                      │
└──────────┬───────────────────────────────────────────────────┬───────────────────┘
           │ click humano, UNA llamada POR FORMATO             │  ⇣ RAMA PARALELA ⇣
           ▼                                                   │
┌────────────────────────────────────────────────────┐         │
│  [E] CONTENT ENGINE   POST /generate-proposal      │         │
│      gate 1: risk        → 409 salvo force         │         │
│      gate 2: canibaliz.  → 409 salvo force         │         │
│      contexto de competencia (similarity > 0.15)   │         │
│      generateProposal() → pieza YA REDACTADA       │         │
│  ✗ la investigación no se persiste: es intermedia  │         │
└──────────────────────┬─────────────────────────────┘         │
                       ▼                                       │
│  [F] PROPUESTAS   aprobar → 'borrador'  ·  rechazar(motivo libre) → 'rechazada'   │
│  [G] EDITOR       generate-draft · generate-image · qa-check · edit-note · SEO    │
│  [H] REVISIÓN     submit-review → 'en_revision'                                   │
│  [I] APROBACIÓN   solo director (panel o Telegram) · exige origin y slug          │
│                   → 'published'                    lib/editorial-review.js        │
                       ▼                                       │
┌────────────────────────────────────────────────────┐         │
│  [J] SALIDAS — independientes entre sí             │         │
│      WEB  ─ Astro lee status='published'           │         │
│      FB   ─ POST /distribution/facebook  (title+dek+link)     │
│      WA   ─ POST /distribution/whatsapp  (link wa.me)         │
│      WP   ─ POST /distribution/wordpress                      │
│      └──► published_content (bitácora por canal)   │         │
│  ✗ ninguna comparte objeto: son 4 empaques del mismo texto    │
└────────────────────────────────────────────────────┘         │
                                                               ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [K] BUENOS DÍAS, PEROTE   —  NO pasa por [E]…[J]. Lee `topics` directo.          │
│                                                                                  │
│  cron 1min ─► generateContent()      lib/newsletter-content.js:43                │
│               SELECT … FROM topics WHERE detected_at >= 48h                      │
│                 AND verification_status <> 'risk'                                │
│                 ORDER BY confidence DESC, mentions DESC LIMIT 5   ◄── SELECCIÓN   │
│                                                                       AUTOMÁTICA  │
│               + clima REAL (wttr.in) + agenda MANUAL + patrocinador rotado        │
│                     └──► newsletter_editions (JSONB, 1/día, 'pendiente')          │
│                                                                                  │
│  editor edita texto y guion ──► PATCH /pending      (NO puede elegir los temas)   │
│  envío humano ──► claim atómico ──► Resend                                        │
│  audio ──► renderPodcastScript() ──► ElevenLabs ──► mezcla con cortinillas        │
│                                                                                  │
│  ✓ ÚNICO lugar con patrón "objeto maestro → N renders" (newsletter-template.js)   │
│  ✗ topicsUsed es un NÚMERO: no hay trazabilidad edición ↔ tema ↔ nota             │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 14.1 Rupturas y procesos manuales, señalados

| # | Ruptura | Dónde | Consecuencia |
|---|---|---|---|
| R1 | **Sin entrada push** | `modules/listening/index.js:24` — router entero bajo JWT de usuario | El descubrimiento está limitado a lo que nuestras 6 URLs y nuestra query fija alcanzan. Es la limitación central que identifica el documento |
| R2 | **Sin análisis entre [D] y [E]** | — | Se pasa de "es defendible" a "escríbelo". Ningún campo responde por qué importa |
| R3 | **Prioridad por defensibilidad** | `newsletter-content.js:50` | `confidence` mide si se puede publicar, no si vale la pena. El desempate es viralidad |
| R4 | **Una investigación por formato** | `content-engine/index.js:32` | N formatos = N llamadas = N textos que divergen |
| R5 | **El boletín es una rama paralela** | `newsletter-content.js:46` | Nota web y ítem de boletín sobre el mismo hecho son textos sin relación en la base |
| R6 | **Feedback en una sola columna, sin bitácora** | `editorial/index.js` sin `logActivity` en `/reject` y `/return` | El historial de decisiones se sobrescribe; los descartes de RADAR no dejan rastro |
| R7 | **`topics.status` inerte** | Nadie lo consulta aguas abajo | "Aprobar" en RADAR no cambia nada. Tercer eje de estado sin función |
| R8 | **Parámetros del radar manual no se persisten** | `actions.ts:230-256` | La zona/categoría/ventana se disuelven en un string. No se puede saber después qué se buscó ni con qué alcance |
| R9 | **Cobertura de fuentes fija** | `FIRECRAWL_SOURCE_URLS` (6 URLs) | Sin descubrimiento fuera de esa lista, tal como señala §4 del documento |

---

## 15. Flujo objetivo RADAR 2.0

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PROVEEDORES DE INTELIGENCIA EXTERNA           (intercambiables, ninguno fijo)   │
│  Grok Bot · crawler propio · Firecrawl · Perplexity · otro                       │
│  ── cada uno con su API key, su trust y su métrica de precisión ──               │
└───────────────────────────┬─────────────────────────────────────────────────────┘
                            │  contrato de señal único y versionado (17 campos)
                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ★ NUEVO · POST /api/signals            [PUNTO 9]                                │
│    auth por API key de proveedor (patrón telegram/webhook)                       │
│    valida schema · idempotencia por (provider, external_id) · límite de payload  │
│    responde por señal: inserted │ upgraded │ duplicate │ rejected + motivo       │
└───────────────────────────┬─────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ♻ REUTILIZA SIN CAMBIOS · insertTopicIfNew()                                    │
│    applyScrapeMultiSource → applyTrustFromSources → normalizeVerification        │
│    → dedupe 24 h (pg_trgm) → INSERT o UPDATE-merge                               │
│  ＋ topics: event_date · locality · territorial_scope · category · provider ·    │
│             external_id · media_available          (migración ADITIVA)           │
└───────────────────────────┬─────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ★ NUEVO · CREA SCORE 0-100             [PUNTO 12]                               │
│    lib/crea-score.js — función pura, llamada desde insertTopicIfNew              │
│    8 factores · desglose auditable en JSONB · recalculado al hacer upgrade       │
│    ORDENA, NO DECIDE. Ningún tema se oculta por score bajo                       │
└───────────────────────────┬─────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ♻ AMPLÍA · RADAR (panel)                                                        │
│    orden por CREA Score · bandas 80-100 / 60-79 / <60 · filtros existentes       │
│    ★ síntesis operativa del día (§23 del documento):                             │
│      "N señales · N descartadas · N señales · N contextualizar · N análisis CREA"│
│    ★ el descarte pide reason_code    [PUNTO 16]                                  │
└───────────────────────────┬─────────────────────────────────────────────────────┘
                            ▼  decisión humana: qué nivel merece
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ★ NUEVO · MOTOR EDITORIAL CREA         [PUNTO 11]     lib/editorial-engine.js   │
│                                                                                 │
│    NIVEL 1 · Señal      → qué pasó + qué necesita saber el ciudadano            │
│    NIVEL 2 · Contexto   → + por qué importa + contexto                          │
│    NIVEL 3 · Análisis   → los 8 campos completos                                │
│                                                                                 │
│    persiste en editorial_analyses (FK → topics)                                 │
│    ═══ ESTE ES EL OBJETO EDITORIAL MAESTRO ═══     [PUNTO 15]                    │
│    hechos · fuentes · contexto · datos · implicaciones · conversación ·          │
│    pendientes · relevancia para Perote · CREA Score · estado editorial           │
│                                                                                 │
│    nivel 3 SOLO por acción humana o score sobre umbral (control de costo)        │
└───────────────────────────┬─────────────────────────────────────────────────────┘
                            │           ▲
                            │           └── ★ CONVERSACIÓN DIGITAL  [PUNTO 13]
                            │               llena el campo 6 ("qué se está diciendo")
                            │               agregados sin identidad · nota metodológica
                            │               obligatoria · NO es un módulo aparte
                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ♻ CONSERVA INTACTO · REVISIÓN HUMANA — puerta obligatoria                       │
│    APROBAR │ DEVOLVER │ DESCARTAR   ·  exige origin + slug  ·  solo director      │
│    ★ cada decisión registra reason_code en activity_log      [PUNTO 16]          │
└───────────────────────────┬─────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ★ MOTOR MULTIFORMATO — renders puros sobre el objeto maestro   [PUNTO 15]       │
│    generalización de lib/newsletter-template.js, que ya funciona así             │
│                                                                                 │
│    WEB_RENDER   WHATSAPP_RENDER   AUDIO_RENDER   NEWSLETTER_RENDER  SOCIAL_RENDER│
│    cada render guarda analysis_version → si el análisis cambia, quedan marcados   │
│    como desactualizados y el editor decide regenerar (nunca automático)          │
└──────────┬────────────────────────────────────┬─────────────────────────────────┘
           ▼                                    ▼
┌────────────────────────────┐   ┌─────────────────────────────────────────────────┐
│ ♻ DISTRIBUCIÓN              │   │ ♻＋ BUENOS DÍAS, PEROTE        [PUNTO 14]        │
│   web · FB · WA · WordPress │   │   ★ RADAR propone (top CREA Score)               │
│   → published_content       │   │   ★ EDITOR SELECCIONA y asigna sección           │
└────────────────────────────┘   │     PEROTE · VERACRUZ/MÉXICO · MUNDO ·           │
                                 │     ECO/TEC/CULT/DEP · PARA ENTENDER (nivel 3)   │
                                 │   ★ newsletter_edition_items (trazabilidad)      │
                                 │   ♻ clima real · agenda · patrocinador · audio · │
                                 │     claim atómico de envío  — sin cambios        │
                                 └─────────────────────────────────────────────────┘

  ★ nuevo    ♻ reutiliza lo existente    ♻＋ amplía sin reescribir
```

**Los cuatro principios que la arquitectura debe preservar** (todos ya vigentes en el código actual):

1. **Nada se publica sin humano.** `publishProposal` exige rol `director` y `origin` explícito
   (`lib/editorial-review.js:16-23`). Ningún cron publica ni envía.
2. **Los crons gastan lo mínimo.** RADAR solo detecta; el newsletter solo genera. Redactar y analizar en
   profundidad son clicks.
3. **Los datos duros no pasan por el modelo.** Clima, agenda y patrocinador vienen de fuentes reales.
   Extender ese criterio a los datos del campo 4 del Motor Editorial.
4. **Los gates avisan, no censuran.** El patrón `409 + force` con registro del override es la forma
   correcta de que la IA opine sin decidir. El CREA Score debe seguirlo.

---

## 16. Componentes reutilizables

**Regla de esta auditoría: no se propone ni un solo módulo nuevo donde exista uno equivalente.**

| Nueva capacidad | Reutiliza | Por qué sirve tal cual |
|---|---|---|
| **API de señales (9)** | `insertTopicIfNew()` (`topic-detection.js:112`) | Ya es el punto único de escritura de los 3 orígenes actuales. Hereda verificación + dedupe + merge sin duplicar nada |
| | `topic-verification.js` **completo** | Módulo puro, sin DB, ya calibrado y con topes probados. La ingesta externa es exactamente el caso para el que fue escrito |
| | `radar_sources` + `applyTrustFromSources()` | La confianza de un proveedor externo se resuelve con la lista editorial que ya existe |
| | Patrón de `POST /api/telegram/webhook` (`:89-90`) | Secreto en header + `timingSafeEqual` + idempotencia por id externo: el molde completo de la autenticación de máquina |
| | `migrations/034` como plantilla | Migración aditiva con `IF NOT EXISTS` + CHECK sin romper filas legacy: el patrón exacto que necesita la nueva |
| **Explorer / Grok (10)** | `apps/competitor-scraper/` + `lib/competitor-scraper-client.js` | Precedente completo de proveedor externo fuera de proceso: contrato HTTP, timeout, `AbortSignal`, degradación a 503 |
| | `GET /api/content/ai-usage` | Ya agrega tokens reales por acción: la base para comparar costo por proveedor |
| **Motor Editorial (11)** | `chatComplete()` (`ai-client.js:115`) | Cadena de fallback cross-provider ya resuelta y verificada en producción |
| | `parseJson()` (`:182`) | Extracción + reparación de JSON de modelos débiles, ya probada |
| | `VERIFICATION_JSON_SPEC` (`topic-verification.js:370`) | Modelo de cómo se especifica un contrato de salida a un LLM en este proyecto |
| | `directiveBlock()` (`ai-client.js:177`) + `editorial_settings` | La directriz editorial por nota y global ya se antepone al prompt: se aplica igual al análisis |
| | `logActivity()` + `activity_log.metadata` | Trazabilidad de modelo/proveedor/tokens/latencia sin tabla nueva |
| **CREA Score (12)** | `source_count`, `evidence[].kind/reliable`, `radar_sources.trust` | 1 factor completo servido, con pesos ya calibrados |
| | `similarity()` de canibalización (`content-engine/index.js:59`) | El factor "originalidad" ya se calcula; solo hay que leerlo como gradiente |
| | `isBetterTopic()` / `verificationRank()` | Ya existe una noción de orden de calidad entre temas |
| | Patrón `409 + force` + `forced:true` en bitácora | La forma correcta de que un score influya sin decidir |
| **Conversación Digital (13)** | `enrichFacebookTopics()` (`ai-client.js:305`) | Ya analiza texto **ya recolectado** sin salir a buscar: la mitad analítica del módulo |
| | `normalizeEvidence()` (`topic-verification.js:17`) | Patrón de saneamiento con topes de longitud y descarte de URLs inválidas |
| | `competitor_facebook_accounts` (`031`) | Las cuentas a observar ya son configurables desde el panel |
| **Buenos días, Perote (14)** | **Todo el módulo `newsletter`** | Generación, edición, preview, envío con claim atómico, audio, agenda, patrocinador, cron y configuración: **no tocar nada de esto** |
| | `newsletter_editions.content` JSONB | Precedente de objeto editorial persistido y editable |
| | `GET /api/editorial/pipeline` | Ya deriva 6 pasos reales; se extiende con el paso de selección |
| **Multiformato (15)** | **`lib/newsletter-template.js`** | **Es el patrón objetivo, ya implementado**: 3 renderers puros sobre un objeto. Generalizar, no reinventar |
| | `lib/podcast-audio.js` + `elevenlabs-client.js` | AUDIO_RENDER ya existe de punta a punta |
| | `modules/distribution` + `published_content` | La bitácora por canal ya está; los renders solo cambian el contenido que se empuja |
| | Pipeline `content_proposals` con su gate | Un render no es una publicación: la puerta editorial sigue siendo la misma |
| **Feedback (16)** | `review_comment` + validación obligatoria ya existente | Solo hay que añadir el código junto al texto |
| | `activity_log` (append-only, `metadata` JSONB) | El almacén del historial ya existe y ya se consulta con SQL |
| | `GET /api/listening/radar-stats` + sus *hints* | El lugar natural de los agregados de aprendizaje: ya emite reglas simples sobre la calibración |

**Componentes que NO deben tocarse** (funcionan, están probados y son la puerta editorial):
`lib/editorial-review.js`, el claim atómico de `POST /api/newsletter/send`, `middleware/auth.js`,
las migraciones ya aplicadas, y el flujo `propuesta → borrador → en_revision → published`.

---

## 17. Brechas detectadas

| ID | Brecha | Punto | Impacto | Bloquea a |
|---|---|---|---|---|
| B-01 | No existe entrada *push* de señales | 9 | Alto | 10 |
| B-02 | Sin `event_date`: la fecha del hecho vive como prosa | 9 | Alto | 12 (actualidad), métrica "tiempo de detección" |
| B-03 | Sin `locality` ni `territorial_scope` | 9 | Alto | 12 (relevancia local), 14 (secciones), "Relevancia para Perote" (§11 del documento) |
| B-04 | Sin `category` en `topics` | 9 | Medio | 14 (secciones temáticas) |
| B-05 | Sin `provider` / `external_id` | 9 | Alto | Idempotencia, y medir precisión por proveedor en la prueba de 2 semanas |
| B-06 | Sin registry de proveedores: cadena Firecrawl→Perplexity fija en una función | 9, 10 | Alto | 10 |
| B-07 | Faltan 5 de 8 campos del Motor Editorial | 11 | **Crítico** | 12, 14, 15 |
| B-08 | Sin separación investigación/renderizado | 11, 15 | **Crítico** | 15 |
| B-09 | Sin niveles de profundidad (y colisión de nombre con `verification_status='signal'`) | 11 | Medio | Control de costo del análisis |
| B-10 | Sin CREA Score ni su desglose | 12 | Alto | 14 (propuesta priorizada) |
| B-11 | Prioridad actual = defensibilidad + viralidad | 12, 14 | Alto | — |
| B-12 | Sin captura de comentarios: el scraper los descarta | 13 | Alto | 11 (campo 6), 12 (factor conversación) |
| B-13 | Sin salvaguardas metodológicas ni de minimización de datos | 13 | Alto (editorial y legal) | — |
| B-14 | El editor no selecciona los temas del boletín | 14 | Alto | Flujo objetivo del documento |
| B-15 | Sin secciones territoriales ni "PARA ENTENDER" | 14 | Medio | Depende de B-03 y B-07 |
| B-16 | Sin trazabilidad edición ↔ tema ↔ nota | 14 | Alto | Todas las métricas de tiempo del documento |
| B-17 | El boletín es rama paralela: nunca toca `content_proposals` | 14, 15 | Alto | Duplicación de investigación puertas adentro |
| B-18 | Sin objeto editorial maestro para notas | 15 | **Crítico** | 15 completo |
| B-19 | Sin renders por canal: WhatsApp y Social son la nota recortada | 15 | Medio | — |
| B-20 | Sin regeneración ante corrección de datos | 15 | Medio | Depende de B-18 |
| B-21 | Motivos sin taxonomía | 16 | Medio | Dataset de criterio editorial |
| B-22 | `review_comment` se sobrescribe: no hay historial | 16 | Medio | — |
| B-23 | `/reject` y `/return` no escriben en `activity_log` (Telegram sí) | 16 | Medio | Auditoría inconsistente según la vía |
| B-24 | Los descartes de RADAR no capturan motivo | 16 | Alto | Es la decisión más frecuente del día |
| B-25 | `topics` sin ningún índice | Transversal | Alto al escalar ingesta | Punto 9 en volumen |
| B-26 | Sin cobertura de pruebas del camino feliz de IA | Transversal | Alto | Calidad de todo lo nuevo |
| B-27 | `topics.status` no tiene efecto aguas abajo | Transversal | Bajo | Confusión de modelo |

---

## 18. Deuda técnica y riesgos

### 18.1 CRÍTICO

| Riesgo | Evidencia | Por qué es crítico | Mitigación |
|---|---|---|---|
| **Dependencia de cookies de sesión personal de Facebook** | `apps/competitor-scraper/README.md` ("Las cookies expiran cada 30-90 días… si ves muchos `Login wall detected`, es hora de rotar"); `FB_COOKIES_FILE` montado como secreto | Es el único origen de datos de engagement y el único camino posible hacia el punto 13. Su caída silencia la mitad del descubrimiento social, y ampliarlo a comentarios multiplica volumen y riesgo de bloqueo | No ampliar sin decisión explícita. Evaluar Graph API para la página propia. Alertar activamente cuando `Session check FAILED`, hoy solo visible en logs |
| **`topics` como tabla monolítica** | ~24 columnas de 5 migraciones (002, 013, 023, 024, 034) cumpliendo 4 roles: señal cruda, ficha de verificación, ficha editorial, ítem de agenda | Los puntos 9, 11 y 12 añadirían ~15 columnas más sobre la misma fila. Ya hay tres ejes de estado, uno de ellos muerto | Tabla `editorial_analyses` separada con FK. Sobre `topics` solo los campos de **señal** del punto 9 |

### 18.2 ALTO

| Riesgo | Evidencia | Mitigación |
|---|---|---|
| **Cero índices en `topics`** | Ninguna migración crea índice sobre `topics`; `findRecentSimilarTopic` hace `similarity(title,$1)` sobre la ventana de 24 h | Antes de abrir la ingesta externa: índice en `detected_at` y GIN `gin_trgm_ops` sobre `title`. Es una migración de dos líneas y evita un incidente de latencia |
| **Acoplamiento a proveedores en `detectAndSaveTopics`** | `topic-detection.js:227-255`: cadena Firecrawl→Perplexity con `provider`/`model`/`metaExtra` inline | Extraer registry de proveedores como parte del punto 9, **antes** de tocar Grok |
| **Sin pruebas del camino feliz de IA** | `check-listening.js:374` lo declara: *"requiere mock de fetch"* | Añadir un stub de `fetch` reutilizable. Todo lo nuevo (Motor Editorial, score, renders) nace sin red si no se hace |
| **Locks de cron en memoria** | `let running = false` en `newsletter-cron.js:26` y `listening-cron.js:16`, ambos con comentario `ponytail:` declarando el techo | Documentado y consciente. Antes de escalar a N réplicas: advisory lock de Postgres. Con ingesta externa el riesgo de doble gasto sube |
| **Sin trazabilidad de modelo/tokens en la pieza** | `politica-ia-y-gate-editorial.md:1.4` lo marca como *gap de schema*; hoy solo vive en `activity_log.metadata` | Si el punto 16 va a correlacionar rechazos con modelo, hacen falta `model_used` y `tokens_used` en `content_proposals` (o en `editorial_analyses`, mejor) |
| **`parseJson` con reparación por regex** | `ai-client.js:182-198`: comilla palabras sueltas tras `:` | Frontera frágil para payloads de proveedores nuevos. Validar contra un schema explícito en la ingesta, no confiar en la reparación |
| **Documentación desalineada con el código** | `especificacion-pipeline.md:84` dice que el newsletter no tiene tabla ni módulo (tiene ambos); `:41-52` describe un cron que genera 5 formatos por tema (no existe); `politica-ia-y-gate-editorial.md:1.1` dice que content-engine usa Claude/`ANTHROPIC_API_KEY` (usa Nous/OpenRouter) | Riesgo real para esta etapa: un agente o desarrollador nuevo que lea `docs/` diagnostica mal el estado. Marcar esos documentos como históricos o corregirlos |

### 18.3 MEDIO

| Riesgo | Evidencia | Mitigación |
|---|---|---|
| Numeración de migraciones duplicada | Dos `020_*` y dos `021_*` en `db/migrations/` | `readdirSync().sort()` lo hace determinista hoy, pero un archivo intercalado podría aplicarse fuera de orden. No renombrar lo aplicado; sí evitar repetir |
| Límite global de payload 100 kB | `server.js:100` | La ingesta necesita su propio límite explícito, mayor o menor, decidido a propósito |
| Sin credencial de máquina | Solo JWT de usuario y el secreto de Telegram | Modelo de API keys por proveedor con hash en reposo y capacidad de revocar |
| Imágenes en BYTEA dentro de Postgres | `migrations/029`, `content-engine/index.js:194-206` | Funciona hoy porque se borra la anterior en cada regeneración. Multiformato con imagen por canal multiplicaría el tamaño de la base y de los backups |
| Sin política de retención | `especificacion-pipeline.md` lo difiere a propósito | Con ingesta externa, `topics` crece mucho más rápido. Definir archivado antes de que sea un problema |
| Observabilidad ciega en tiempos | No hay `event_date`, ni marcas de tiempo por etapa | Las 5 métricas del documento no son calculables hoy. Ver §23 |
| `preview-radar.html` en la raíz | 15 KB, referenciado como prototipo en `radar-verificacion-plan.md` | Mover a `docs/` |

### 18.4 Riesgos editoriales

| Riesgo | Severidad | Detalle | Mitigación |
|---|---|---|---|
| **Presentar muestra como opinión pública** | **CRÍTICO** | Es el riesgo que el propio documento señala. Un agregado de comentarios de Facebook no representa a Perote | `method_note` NOT NULL en el schema, conteos siempre visibles, prohibir porcentajes bajo muestra mínima. El proyecto **ya** tiene el precedente correcto: `socialChannels: []` y `totalReach: null` en vez de simular (`editorial/index.js:376`) |
| **La viralidad entrando por la puerta de atrás** | ALTO | `mentions` ya desempata el orden del boletín (`newsletter-content.js:51`) y solo tiene valor real en Facebook | Peso bajo y acotado en el CREA Score, registrado en el desglose. Auditar la correlación score↔descarte al mes |
| **El score leído como permiso de publicación** | ALTO | Un número de 0 a 100 junto a un botón "generar" se convierte en autorización de facto | Etiqueta de banda, no semáforo. Sin auto-generación. Mantener el gate humano y el `force` con registro |
| **Análisis IA presentado como investigación propia** | ALTO | Los campos 4 y 5 del Motor Editorial (datos, implicaciones) son terreno de alucinación | Todo dato con fuente en `evidence[]` o no se muestra. El proyecto ya aplica esa regla al clima y a la agenda |
| **Cobertura estatal/nacional sin criterio local** | MEDIO | Ampliar a VERACRUZ/MÉXICO/MUNDO sin "relevancia para Perote" convierte a CREA en agregador genérico — exactamente lo que el documento pide evitar | El campo "relevancia para Perote" debe ser **obligatorio** para publicar un tema no local |
| **Duplicación puertas adentro** | MEDIO | Boletín y web generan textos independientes sobre el mismo hecho (R5/B-17) | Trazabilidad `newsletter_edition_items` + objeto maestro compartido |

---

## 19. Backlog técnico

Complejidad: **S** ≤1 día · **M** 2–4 días · **L** 1–2 semanas · **XL** >2 semanas.
Los archivos citados **existen y fueron verificados**; los marcados *(nuevo)* son propuestas de creación.

### Bloque 0 — Preparación (habilita todo lo demás)

| ID | Objetivo | Módulo | Archivos / áreas | Depende de | Prioridad | Compl. | Criterio de aceptación | Clasificación |
|---|---|---|---|---|---|---|---|---|
| **R2-01** | Índices en `topics` antes de abrir la ingesta | api/db | `migrations/043_*.sql` *(nuevo)* | — | **P0** | S | `EXPLAIN` de `findRecentSimilarTopic` deja de hacer seq scan; `npm run check:listening` sigue en verde | REQUIERE DESARROLLO |
| **R2-02** | Stub de `fetch` reutilizable para probar caminos felices de IA | api/tests | `scripts/lib/check-helpers.js`, `scripts/check-listening.js:374` | — | **P0** | M | Existe un test que ejercita detección completa sin llamar a ninguna API de pago y falla si `normalizeVerification` se rompe | REQUIERE DESARROLLO |
| **R2-03** | Contrato de señal externa documentado y versionado (17 campos) | docs | `docs/ia/contrato-senales-externas.md` *(nuevo)* | — | **P0** | S | Un tercero puede implementar un proveedor leyendo solo ese documento | REQUIERE DESARROLLO |
| **R2-04** | Corregir/marcar documentación desalineada | docs | `docs/ia/especificacion-pipeline.md`, `docs/ia/politica-ia-y-gate-editorial.md` | — | P2 | S | Ningún documento afirma como pendiente algo ya implementado, ni al revés | AJUSTE MENOR |

### Bloque 1 — Punto 16 · Feedback (primero por acumulación de valor)

| ID | Objetivo | Módulo | Archivos / áreas | Depende de | Prioridad | Compl. | Criterio de aceptación | Clasificación |
|---|---|---|---|---|---|---|---|---|
| **R2-05** | Taxonomía de motivos + columna | api/editorial | `migrations/044_*.sql` *(nuevo)*, `lib/editorial-reasons.js` *(nuevo)* | R2-03 | **P0** | S | Los 10 motivos del documento definidos en un solo lugar y consumidos por API y panel | AJUSTE MENOR |
| **R2-06** | `reason_code` en rechazo y devolución + bitácora | api/editorial | `modules/editorial/index.js:156-171`, `:281-288`, `lib/editorial-review.js:33` | R2-05 | **P0** | S | `/reject` y `/return` aceptan y persisten `reason_code` y escriben en `activity_log`; el motivo libre sigue siendo obligatorio | AJUSTE MENOR |
| **R2-07** | Motivo en descarte de temas de RADAR | api/listening | `modules/listening/index.js:254` (`DELETE /topics/:id`), `:223` (batch) | R2-05 | **P0** | S | Descartar un tema exige `reason_code`; queda en `activity_log` con `topic_id`, `verification_status` y (cuando exista) `crea_score` | AJUSTE MENOR |
| **R2-08** | Selectores de motivo en el panel | admin | `screens/aprobacion.ts:36-40`, `screens/propuestas.ts:26-28`, `screens/radar.ts` (drawer), `actions.ts:721` | R2-06, R2-07 | **P0** | S | No se puede rechazar, devolver ni descartar sin elegir motivo; `npx tsc --noEmit` y E2E en verde | AJUSTE MENOR |
| **R2-09** | Agregados de feedback en `radar-stats` | api/listening | `modules/listening/index.js:478-624` | R2-06, R2-07 | P2 | S | El endpoint devuelve motivos por frecuencia y ventana, y emite al menos un *hint* nuevo derivado de ellos | AJUSTE MENOR |

### Bloque 2 — Punto 9 · API de señales externas

| ID | Objetivo | Módulo | Archivos / áreas | Depende de | Prioridad | Compl. | Criterio de aceptación | Clasificación |
|---|---|---|---|---|---|---|---|---|
| **R2-10** | Campos de señal en `topics` (migración aditiva) | api/db | `migrations/045_*.sql` *(nuevo)* — `event_date`, `locality`, `territorial_scope`, `category`, `provider`, `external_id`, `media_available` + único parcial `(provider, external_id)` | R2-03 | **P0** | S | Filas legacy intactas (todos NULL); `npm run migrate` idempotente; ningún check existente se rompe | REQUIERE DESARROLLO |
| **R2-11** | Registro de proveedores con API key | api/db + auth | `migrations/046_*.sql` *(nuevo)* `signal_providers`, `lib/signal-auth.js` *(nuevo)* | R2-10 | **P0** | M | Key hasheada en reposo, comparación en tiempo constante (patrón `modules/telegram/index.js:14-18`), revocable, sin exponer la key en logs | REQUIERE DESARROLLO |
| **R2-12** | `POST /api/signals` con validación e idempotencia | api/listening | `modules/signals/index.js` *(nuevo)*, montado en `server.js:131-143` | R2-11 | **P0** | M | Señal válida → 201 con `inserted\|upgraded`; repetida → `duplicate` sin fila nueva; inválida → 400 con campos; sin key → 401. Escribe **solo** vía `insertTopicIfNew()` | REQUIERE DESARROLLO |
| **R2-13** | Adaptador de señal externa → forma interna | api/lib | `lib/signal-adapter.js` *(nuevo)*, reutiliza `topic-verification.js` | R2-12 | **P0** | M | Los 17 campos mapeados; `evidence[]` se construye desde fuente original + corroborantes; `provider.trust` participa vía `applyTrustFromSources` | REQUIERE DESARROLLO |
| **R2-14** | Registry de proveedores de descubrimiento (desacoplar la cadena fija) | api/lib | `lib/topic-detection.js:227-255` | R2-13 | P1 | M | Añadir un proveedor no requiere editar `detectAndSaveTopics`; Firecrawl y Perplexity siguen funcionando igual; `check:listening` en verde | REQUIERE DESARROLLO |
| **R2-15** | Panel: origen y procedencia de la señal | admin | `screens/radar.ts` (ficha y tabla), `store.ts:203` (tipo `Topic`) | R2-12 | P1 | S | La ficha muestra proveedor, fecha del hecho, localidad y alcance cuando existen; null-safe con temas legacy | REQUIERE DESARROLLO |
| **R2-16** | Checks de la ingesta | api/tests | `scripts/check-signals.js` *(nuevo)*, `scripts/run-checks.js` | R2-12 | **P0** | M | Cubre auth, validación, idempotencia, dedupe contra tema existente y upgrade; corre en CI sin gastar en APIs | REQUIERE DESARROLLO |

### Bloque 3 — Punto 11 · Motor Editorial CREA

| ID | Objetivo | Módulo | Archivos / áreas | Depende de | Prioridad | Compl. | Criterio de aceptación | Clasificación |
|---|---|---|---|---|---|---|---|---|
| **R2-17** | Decidir y documentar los 3 niveles y su disparador | docs | `docs/ia/motor-editorial-crea.md` *(nuevo)* | — | **P0** | S | Queda escrito qué campos llena cada nivel, quién lo dispara y cuánto cuesta cada uno. Resuelve la colisión de nombre con `verification_status='signal'` | REQUIERE INVESTIGACIÓN |
| **R2-18** | Tabla `editorial_analyses` (= objeto editorial maestro) | api/db | `migrations/047_*.sql` *(nuevo)* | R2-17 | **P0** | M | Los 8 campos + `analysis_level` + `relevancia_perote` + trazabilidad de modelo/tokens; FK a `topics`; permite varias versiones por tema | REQUIERE DESARROLLO |
| **R2-19** | Servicio del Motor Editorial | api/lib | `lib/editorial-engine.js` *(nuevo)*, reutiliza `ai-client.js:115` `chatComplete` y `:182` `parseJson` | R2-18 | **P0** | L | Un prompt por nivel; salida validada y saneada como `normalizeVerification`; registra proveedor, modelo y tokens en `activity_log` | REQUIERE DESARROLLO |
| **R2-20** | Endpoints de análisis | api/listening | `modules/listening/index.js` o `modules/editorial/index.js` | R2-19 | **P0** | M | `POST /topics/:id/analyze {level}` (rate-limited como `aiLimiter`), `GET /topics/:id/analysis`. Nivel 3 nunca se dispara desde un cron | REQUIERE DESARROLLO |
| **R2-21** | Panel: ficha de análisis editorial | admin | `screens/radar.ts` (drawer), `store.ts`, `actions.ts` | R2-20 | **P0** | M | Los 8 campos visibles y distinguibles de la ficha de verificación; botón por nivel con el costo declarado, como ya hace la pestaña Radar manual | REQUIERE DESARROLLO |
| **R2-22** | `generate-proposal` lee del análisis, no del tema crudo | api/content-engine | `modules/content-engine/index.js:32-129`, `lib/ai-client.js:328` | R2-20 | P1 | M | Si el tema tiene análisis, la propuesta se genera desde él; si no, comportamiento actual sin cambios. Los gates de riesgo y canibalización siguen intactos | REQUIERE DESARROLLO |
| **R2-23** | Checks del Motor Editorial | api/tests | `scripts/check-editorial-engine.js` *(nuevo)* | R2-19, R2-02 | **P0** | M | Camino feliz por nivel con `fetch` stubeado; validación rechaza salidas incompletas | REQUIERE DESARROLLO |

### Bloque 4 — Punto 12 · CREA Score

| ID | Objetivo | Módulo | Archivos / áreas | Depende de | Prioridad | Compl. | Criterio de aceptación | Clasificación |
|---|---|---|---|---|---|---|---|---|
| **R2-24** | Fórmula y pesos documentados | docs | `docs/ia/crea-score.md` *(nuevo)*, en línea con `docs/ia/radar-calibracion.md` | R2-10, R2-18 | **P0** | S | Los 8 factores con peso, origen del dato y qué hacer si falta. Perillas ubicadas en código, mismo formato que la tabla de knobs existente | REQUIERE DESARROLLO |
| **R2-25** | `lib/crea-score.js` — función pura | api/lib | `lib/crea-score.js` *(nuevo)* | R2-24 | **P0** | M | Sin acceso a DB, testeable como `topic-verification.js`; devuelve score y desglose; factores ausentes no rompen ni inflan el resultado | REQUIERE DESARROLLO |
| **R2-26** | Persistir score y recalcular al enriquecer | api/db + lib | `migrations/048_*.sql` *(nuevo)*, `lib/topic-detection.js:112` | R2-25 | **P0** | S | Score y desglose se escriben en INSERT y en el UPDATE de `_action:'upgraded'` | REQUIERE DESARROLLO |
| **R2-27** | Exponer y ordenar por score | api/listening | `modules/listening/index.js:145` (SELECT), `:168` (summary) | R2-26 | **P0** | S | `?order=score` disponible; el orden por defecto sigue siendo cronológico salvo elección explícita; `summary` incluye bandas | REQUIERE DESARROLLO |
| **R2-28** | Panel: score con bandas y desglose | admin | `screens/radar.ts:16-28` (patrón `confidenceBand` ya existente), `store.ts:203` | R2-27 | **P0** | M | Banda visible en la tabla, desglose en la ficha. **Ningún tema se oculta por score bajo** | REQUIERE DESARROLLO |
| **R2-29** | Síntesis operativa del día (§23 del documento) | api + admin | `modules/listening/index.js:168` (`/topics/summary`), `screens/radar.ts` | R2-27, R2-07 | P1 | M | RADAR abre con "N señales desde el último corte · N descartadas · N señales · N contextualizar · N análisis CREA", con números reales | REQUIERE DESARROLLO |

### Bloque 5 — Punto 14 · Buenos días, Perote

| ID | Objetivo | Módulo | Archivos / áreas | Depende de | Prioridad | Compl. | Criterio de aceptación | Clasificación |
|---|---|---|---|---|---|---|---|---|
| **R2-30** | Tabla puente de trazabilidad | api/db | `migrations/049_*.sql` *(nuevo)* `newsletter_edition_items` | R2-18 | **P0** | S | Cada ítem de una edición referencia su `topic_id` y, si existe, su `analysis_id`, con sección y posición | REQUIERE DESARROLLO |
| **R2-31** | Selección editorial en vez de `ORDER BY … LIMIT 5` | api/newsletter | `lib/newsletter-content.js:43-77`, `modules/newsletter/index.js:41` | R2-30, R2-27 | **P0** | M | `generateContent(selection)` usa la selección del editor; **sin selección conserva el comportamiento actual** para no romper el cron | REQUIERE DESARROLLO |
| **R2-32** | Secciones del boletín | api/newsletter | `lib/newsletter-content.js`, `lib/newsletter-template.js` | R2-31, R2-10 | P1 | M | PEROTE / VERACRUZ-MÉXICO / MUNDO / ECO-TEC-CULT-DEP / PARA ENTENDER; **secciones vacías simplemente no se renderizan** (la relevancia manda sobre la cantidad) | REQUIERE DESARROLLO |
| **R2-33** | Panel: pantalla de selección matutina | admin | `screens/hermes.ts` (pestaña "Edición de hoy"), `actions.ts` | R2-31 | **P0** | M | RADAR propone por score, el editor marca y asigna sección, luego genera. El editor puede ver la ficha del tema antes de decidir | REQUIERE DESARROLLO |
| **R2-34** | "PARA ENTENDER" desde un análisis nivel 3 | api/newsletter | `lib/newsletter-content.js`, `lib/editorial-engine.js` | R2-19, R2-32 | P1 | M | La sección se llena solo si hay un análisis nivel 3 aprobado; si no, no aparece | REQUIERE DESARROLLO |
| **R2-35** | Checks del boletín ampliados | api/tests | `scripts/check-newsletter.js` | R2-31 | P1 | S | Cubre selección explícita, fallback sin selección, y trazabilidad de ítems | AJUSTE MENOR |

### Bloque 6 — Punto 15 · Multiformato

| ID | Objetivo | Módulo | Archivos / áreas | Depende de | Prioridad | Compl. | Criterio de aceptación | Clasificación |
|---|---|---|---|---|---|---|---|---|
| **R2-36** | `lib/renders/` con funciones puras por canal | api/lib | `lib/renders/*.js` *(nuevo)*, generalizando `lib/newsletter-template.js` | R2-18 | P1 | L | Entrada = objeto maestro, salida = string; sin DB; probadas sin infraestructura, igual que los tres renderers actuales | REQUIERE DESARROLLO |
| **R2-37** | Persistir renders con versión del análisis | api/db | `migrations/050_*.sql` *(nuevo)* | R2-36 | P1 | M | Cada render guarda `analysis_id` y `analysis_version`; si el análisis avanza, el render queda marcado como desactualizado | REQUIERE DESARROLLO |
| **R2-38** | Regeneración explícita desde el panel | api + admin | `modules/content-engine/index.js`, `screens/editor.ts` | R2-37 | P2 | M | El editor ve qué renders quedaron viejos y regenera uno a uno. **Nunca automático sobre contenido ya publicado** | REQUIERE DESARROLLO |
| **R2-39** | WHATSAPP_RENDER y SOCIAL_RENDER propios | api/distribution | `modules/distribution/index.js:96-105` (WA), `:76-92` (FB) | R2-36 | P2 | M | Dejan de ser "título + dek + link": se genera pieza propia por canal desde el objeto maestro. La bitácora `published_content` no cambia | REQUIERE DESARROLLO |

### Bloque 7 — Punto 10 · Explorer / Grok

| ID | Objetivo | Módulo | Archivos / áreas | Depende de | Prioridad | Compl. | Criterio de aceptación | Clasificación |
|---|---|---|---|---|---|---|---|---|
| **R2-40** | Investigación de viabilidad de Grok/xAI | docs | `docs/ia/evaluacion-explorer-externo.md` *(nuevo)* | — | P1 | M | Responde: acceso a X, costo por señal, cuota, calidad en español regional, términos para reuso editorial. Con recomendación explícita: adoptar, aplazar o descartar | REQUIERE INVESTIGACIÓN |
| **R2-41** | Proveedor simulado para validar el contrato | scripts | `scripts/fake-signal-provider.js` *(nuevo)* | R2-12 | **P0** | S | Un script empuja señales de prueba a `POST /api/signals` y permite recorrer el MVP completo **sin depender de Grok** | REQUIERE DESARROLLO |
| **R2-42** | Worker explorador (si R2-40 recomienda adoptar) | fuera del API | proceso propio, como `apps/competitor-scraper/` | R2-40, R2-41 | P2 | L | Corre fuera del API y solo consume `POST /api/signals`. **El API no tiene ni una línea específica de Grok** | REQUIERE DESARROLLO |
| **R2-43** | Precisión comparada por proveedor | api/listening | `modules/listening/index.js:478` (`radar-stats`) | R2-42, R2-07 | P2 | M | El endpoint reporta, por proveedor: señales aportadas, tasa de descarte, tasa de publicación y score medio | REQUIERE DESARROLLO |

### Bloque 8 — Punto 13 · Conversación Digital

| ID | Objetivo | Módulo | Archivos / áreas | Depende de | Prioridad | Compl. | Criterio de aceptación | Clasificación |
|---|---|---|---|---|---|---|---|---|
| **R2-44** | Investigación de adquisición de comentarios | docs | `docs/ia/conversacion-digital-adquisicion.md` *(nuevo)* | — | P2 | M | Compara Graph API sobre página propia vs. terceros vs. no hacerlo, con lectura legal y de riesgo operativo. Recomendación explícita | REQUIERE INVESTIGACIÓN |
| **R2-45** | Política de minimización de datos | docs | mismo documento | R2-44 | P2 | S | Define qué se guarda, qué no, cuánto tiempo, y qué se descarta tras el análisis | REQUIERE INVESTIGACIÓN |
| **R2-46** | Captura de comentarios (según R2-44) | scraper o api | `apps/competitor-scraper/src/facebook.js:25-27` **o** cliente de Graph API | R2-44, R2-45 | P3 | L | El corpus se procesa y se descarta; no se persiste identidad de personas | REQUIERE DESARROLLO |
| **R2-47** | Tabla y servicio de análisis de conversación | api | `migrations/*` *(nuevo)* `conversation_analyses`, `lib/conversation-analysis.js` *(nuevo)* | R2-46 | P3 | L | Guarda solo agregados; `method_note` **NOT NULL**; conteos de posts y comentarios obligatorios | REQUIERE DESARROLLO |
| **R2-48** | Alimentar el campo 6 del Motor Editorial y el factor de score | api/lib | `lib/editorial-engine.js`, `lib/crea-score.js` | R2-47 | P3 | M | "¿Qué se está diciendo?" se llena desde el análisis; **no** existe módulo duplicado | REQUIERE DESARROLLO |
| **R2-49** | Panel con salvaguardas visuales | admin | `screens/radar.ts` | R2-47 | P3 | M | La nota metodológica es imposible de omitir; ninguna distribución se muestra sin su tamaño de muestra | REQUIERE DESARROLLO |

---

## 20. Orden recomendado de implementación

**No seguir el orden 9→16 del documento.** Tres razones, todas verificables en el código:

1. El punto 16 es barato y su valor **depende del tiempo transcurrido**: cada día sin taxonomía de motivos
   es un día de criterio editorial que no se recupera.
2. El punto 10 depende del contrato del punto 9 y de una investigación abierta. Empezar por Grok reproduce
   el acoplamiento a proveedor que el propio documento pide evitar.
3. El punto 13 es el único con exposición legal y con el insumo inexistente. Va al final.

### Orden

```
  SEMANA 0     R2-01 · R2-02 · R2-03        preparación: índices, pruebas de IA, contrato
       │
       ├────► BLOQUE 1 · PUNTO 16  (R2-05…R2-09)   ── se puede hacer EN PARALELO con todo
       │       feedback estructurado. Empieza a acumular dataset desde el día 1.
       │
  ═════▼═══════════════════════════════════════════════════════════════════════
  FASE 1       BLOQUE 2 · PUNTO 9   (R2-10…R2-16) ─┐
               entrada push + contrato + registry   │  independientes entre sí:
                                                    ├─ pueden ir EN PARALELO
  FASE 1'      BLOQUE 3 · PUNTO 11  (R2-17…R2-23) ─┘  (11 no necesita señales nuevas:
               Motor Editorial + objeto maestro         corre sobre los temas de hoy)
  ═════▼═══════════════════════════════════════════════════════════════════════
  FASE 2       BLOQUE 4 · PUNTO 12  (R2-24…R2-29)
               CREA Score        ← necesita campos de 9 (localidad, fecha)
                                   y campos de 11 (implicaciones, relevancia)
  ═════▼═══════════════════════════════════════════════════════════════════════
  FASE 3       BLOQUE 5 · PUNTO 14  (R2-30…R2-35)      ◄══ CIERRE DEL MVP
               selección humana + secciones + trazabilidad
               ← necesita 12 para proponer priorizado y 11 para "PARA ENTENDER"
  ═════▼═══════════════════════════════════════════════════════════════════════
  FASE 4       BLOQUE 6 · PUNTO 15  (R2-36…R2-39)   ─┐
               renders multiformato                  │  independientes entre sí
  FASE 4'      BLOQUE 7 · PUNTO 10  (R2-40…R2-43)   ─┘
               explorer real (si la investigación lo recomienda)
  ═════▼═══════════════════════════════════════════════════════════════════════
  FASE 5       BLOQUE 8 · PUNTO 13  (R2-44…R2-49)
               Conversación Digital — solo tras investigación y política de datos
```

### Justificación por pregunta

**¿Qué debe hacerse primero?** `R2-01` (índices) y `R2-02` (stub de pruebas de IA), antes de escribir
cualquier funcionalidad. El primero evita un problema de latencia que la ingesta externa provocaría; el
segundo determina si todo lo que viene nace con o sin red. Inmediatamente después, el punto 16 completo.

**¿Qué puede hacerse en paralelo?**
- El punto 16 con **cualquier cosa**: no comparte archivos con los demás bloques.
- Los puntos 9 y 11 entre sí: el Motor Editorial funciona sobre los temas que RADAR ya detecta hoy;
  no necesita esperar a la ingesta externa. Son dos personas trabajando sin colisionar.
- Los puntos 15 y 10 entre sí, una vez cerrado el objeto maestro.

**¿Qué depende de qué?**

| Depende | De | Por qué |
|---|---|---|
| 10 | 9 | Sin contrato de señal, Grok se acopla dentro del API. Es el error explícito que el documento pide evitar |
| 12 | 9 | Relevancia local y actualidad necesitan `locality`, `territorial_scope` y `event_date` |
| 12 | 11 | Implicaciones prácticas y relevancia salen del análisis |
| 14 | 12 | "RADAR propone" exige una priorización que hoy no existe |
| 14 | 11 | "PARA ENTENDER" **es** un análisis nivel 3 |
| 15 | 11 | El objeto editorial maestro **es** `editorial_analyses` |
| 13 | investigación | Sin decidir la adquisición no hay nada que construir |
| 11 (campo 6) | 13 | "Qué se está diciendo" queda vacío hasta entonces — **y eso está bien**: el análisis debe tolerar campos ausentes |

**¿Qué debería posponerse?** El punto 13 completo, `R2-39` (renders propios de WhatsApp/Social),
`R2-38` (regeneración) y `R2-43` (precisión por proveedor). Ninguno bloquea el flujo de punta a punta.

**¿Qué debe investigarse antes?** `R2-40` (Grok), `R2-44`/`R2-45` (adquisición de comentarios y política de
datos) y `R2-17` (criterio de niveles de profundidad — el único que **sí** bloquea el MVP y debe resolverse
en la semana 0).

**¿Cuál es el MVP?** El recorrido completo de la §20 del documento, detallado abajo.

---

## 21. MVP

**Objetivo:** que funcione de punta a punta, con datos reales, el recorrido

```
DETECCIÓN EXTERNA → RADAR → VERIFICACIÓN → MOTOR EDITORIAL CREA → APROBACIÓN HUMANA → BUENOS DÍAS, PEROTE
```

durante **dos semanas, produciendo diez ediciones** y midiendo detección, precisión, correcciones, tiempos
y respuesta de audiencia.

### 21.1 MVP INCLUYE

| # | Capacidad | Backlog | Por qué es indispensable |
|---|---|---|---|
| 1 | Índices en `topics` y stub de pruebas de IA | R2-01, R2-02 | Sin lo primero, la ingesta degrada; sin lo segundo, todo lo nuevo nace sin cobertura |
| 2 | Contrato de señal documentado | R2-03 | Es lo que hace sustituible al proveedor: el requisito central de §6 del documento |
| 3 | **Feedback estructurado completo** | R2-05 … R2-08 | Su valor depende del tiempo. Debe estar recolectando desde la edición 1, no desde la 10 |
| 4 | **`POST /api/signals`** con auth, validación e idempotencia | R2-10 … R2-13, R2-16 | Es "detección externa". Sin esto no hay MVP |
| 5 | **Proveedor simulado** | R2-41 | Permite recorrer y medir el flujo completo **sin depender de la investigación sobre Grok** |
| 6 | **Motor Editorial niveles 1 y 2 + nivel 3 bajo demanda** | R2-17 … R2-21, R2-23 | Es la pieza que justifica RADAR 2.0. Sin ella, es RADAR 1.0 con más entradas |
| 7 | **CREA Score con los factores disponibles** | R2-24 … R2-28 | Sin priorización, "RADAR propone" no significa nada. Los factores faltantes se declaran ausentes en el desglose, no se inventan |
| 8 | **Selección editorial del boletín + trazabilidad** | R2-30, R2-31, R2-33 | Es el paso "editor selecciona" del flujo objetivo, y hoy no existe |
| 9 | Aprobación humana | *(ya existe)* | Se conserva sin cambios: es la fortaleza que el documento pide mantener |

### 21.2 MVP NO INCLUYE

| Qué queda fuera | Por qué |
|---|---|
| **Grok como proveedor real** (R2-40, R2-42) | Requiere investigación. El proveedor simulado valida el contrato igual de bien y el MVP no se bloquea |
| **Conversación Digital completa** (bloque 8) | El insumo no existe y hay exposición legal. El campo 6 del análisis queda vacío y declarado como vacío |
| **Renders multiformato para notas** (bloque 6) | El boletín ya tiene sus renders. Web sigue leyendo `content_proposals` como hoy |
| **Secciones territoriales y "PARA ENTENDER"** (R2-32, R2-34) | Dependen de que la ingesta externa traiga alcance territorial y de que haya análisis nivel 3 acumulados. Van en la iteración siguiente |
| **Regeneración automática de renders** (R2-38) | Sin objeto maestro renderizado no aplica |
| **Precisión comparada por proveedor** (R2-43) | Con un solo proveedor simulado no hay nada que comparar |
| **WhatsApp/Social con pieza propia** (R2-39) | Mejora de empaque, no de flujo |

### 21.3 Dependencias

**Servicios externos ya operativos** (sin trabajo adicional): Perplexity, Nous Portal, OpenRouter,
Firecrawl, ElevenLabs, Resend, Facebook Graph, Telegram, Postgres 15/16, Dokploy.

**Dependencias nuevas del MVP:**

| Dependencia | Estado | Riesgo |
|---|---|---|
| Presupuesto de IA para el Motor Editorial | **A definir.** Es la única variable de costo nueva. Nivel 3 es una llamada cara por tema | Medio — mitigado porque nivel 3 solo se dispara a mano |
| Proveedor externo | Simulado en el MVP | Ninguno |
| Criterio de niveles 1/2/3 | **Decisión editorial pendiente** (R2-17) | **Bloquea el bloque 3.** Resolver en semana 0 |
| Pesos del CREA Score | **Decisión editorial pendiente** (R2-24) | Bloquea el bloque 4. Se puede arrancar con pesos provisionales y calibrar, como ya se hizo con `confidence` |
| Taxonomía de motivos | Cerrada en §17 del documento | Ninguno |

**Sin dependencias de infraestructura nueva:** el MVP corre en el mismo proceso Express, la misma base y
el mismo despliegue. No requiere colas, workers ni servicios adicionales.

### 21.4 Validación — qué debe probarse antes de darlo por terminado

**Técnico (automatizable, en CI):**

1. `npm run check` completo en verde, incluidos los checks nuevos (R2-16, R2-23).
2. Una señal externa idéntica enviada dos veces produce **una** fila y responde `duplicate` la segunda.
3. Una señal cuyo título se parece a un tema de las últimas 24 h **no** crea fila nueva: hace merge
   (`_action:'upgraded'`) y conserva el título canónico.
4. Una señal con `verification_status='risk'` sigue bloqueando `generate-proposal` con 409 salvo `force`,
   y el override queda registrado.
5. El CREA Score se recalcula al enriquecerse un tema, y el desglose declara explícitamente los factores
   sin dato en vez de asumir cero.
6. Un análisis nivel 3 **no** se dispara desde ningún cron.
7. Rechazar, devolver o descartar sin `reason_code` responde 400.
8. `generateContent()` sin selección explícita produce exactamente lo mismo que hoy (no regresión del cron).

**Editorial (manual, durante las dos semanas):**

9. Diez ediciones de "Buenos días, Perote" generadas con selección humana explícita.
10. Cada ítem publicado es trazable hasta su señal de origen y su proveedor.
11. Al menos un análisis nivel 3 llega al boletín y **explica** algo, no solo lo reporta — el criterio de
    éxito del documento (*"¿CREA consiguió explicar algo que los demás solamente reportaron?"*).
12. Ningún contenido publicado sin aprobación humana explícita (verificable en `activity_log`).
13. Ningún dato numérico publicado sin fuente en `evidence[]`.

**Operativo:**

14. Costo real de IA medido con `GET /api/content/ai-usage` y comparado con el previo al MVP.
15. Ninguna caída del boletín diario durante las dos semanas.
16. El registro de motivos acumula ≥50 decisiones tipificadas — masa mínima para leer patrones.

---

## 22. Criterios de aceptación

### 22.1 Por punto

| Punto | Se considera terminado cuando… |
|---|---|
| **9** | Un proveedor externo autenticado con su propia API key envía una señal y esta aparece en RADAR verificada, deduplicada y con su procedencia visible. Reenviarla no duplica. Los 17 campos del contrato están soportados (los no aplicables, explícitamente nulos). Cambiar de proveedor no requiere tocar el API |
| **10** | Existe un documento de evaluación con recomendación explícita. Si es adoptar: el explorador corre **fuera** del API y `grep -ri grok apps/api/src` no devuelve nada |
| **11** | Un tema puede analizarse en 3 niveles; los 8 campos se persisten en una entidad propia; `generate-proposal` puede generar **desde el análisis**; el nivel 3 nunca se dispara solo. El análisis y la pieza son objetos distintos |
| **12** | Todo tema nuevo tiene score y desglose auditable; RADAR puede ordenarse por él; ningún tema se oculta por score bajo; ningún score dispara publicación |
| **13** | Existe política de datos escrita y aplicada; solo se guardan agregados; `method_note` es obligatoria en base de datos; ninguna distribución se muestra sin su tamaño de muestra |
| **14** | El editor selecciona explícitamente qué entra en la edición; cada ítem es trazable a su tema y análisis; el cron sigue funcionando sin selección; nada se envía sin acción humana |
| **15** | Existe un objeto editorial maestro; cada canal tiene su render como función pura; un cambio en el análisis marca los renders derivados como desactualizados; regenerar es una decisión humana |
| **16** | Rechazar, devolver y descartar exigen motivo tipificado; cada decisión queda en `activity_log`; `radar-stats` reporta motivos por frecuencia |

### 22.2 Transversales (aplican a todo el trabajo de RADAR 2.0)

1. **No se rompe nada de lo que ya funciona.** `npm run check` en verde en cada PR; el boletín diario no se
   interrumpe; el portal público no se ve afectado.
2. **Ninguna migración destructiva.** Todas aditivas, `IF NOT EXISTS`, filas legacy tolerando NULL —
   el patrón de `migrations/034`, que ya demostró que funciona con datos previos.
3. **La aprobación humana no se debilita en ningún punto.** Ninguna funcionalidad nueva publica, envía o
   distribuye sin acción explícita de una persona.
4. **Toda lógica no trivial deja una prueba ejecutable**, siguiendo la convención del repositorio
   (un script en `scripts/`, sin frameworks nuevos).
5. **Todo campo generado por IA es auditable**: qué modelo, qué proveedor, cuántos tokens, en `activity_log`.
6. **Ningún dato numérico publicado sin fuente en `evidence[]`.**
7. **La documentación se actualiza en el mismo PR.** La deuda documental detectada en §18.2 es la prueba
   de qué pasa cuando no se hace.

---

## 23. Métricas de éxito

### 23.1 Las cinco métricas del documento y su viabilidad actual

| Métrica | Definición | ¿Medible hoy? | Qué falta |
|---|---|---|---|
| **Tiempo de detección** | acontecimiento → RADAR | **No** | `event_date` (R2-10). Hoy solo existe `detected_at`: se puede medir cuándo lo vimos, no cuánto tardamos |
| **Tiempo de procesamiento** | RADAR → propuesta | **Sí** | `topics.detected_at` → `content_proposals.created_at`. Consultable ya |
| **Tiempo editorial** | propuesta → aprobación | **Sí** | `created_at` → `published_at`. `GET /api/editorial/metrics` ya expone `avgDraftDays` |
| **Tasa de aceptación** | generadas / publicadas | **Sí** | `approvalRate` ya calculado en `modules/editorial/index.js:404` |
| **Corrección humana** | % modificado antes de aprobar | **No** | No se guarda el cuerpo generado por IA antes de la edición humana. Requiere versionar el borrador inicial |
| **Precisión** | errores detectados después | **No** | No existe registro de corrección post-publicación. `PATCH /proposals/:id/reopen` existe pero no distingue "corregir un error" de "actualizar" |
| **Utilidad** | clics, lectura, escucha | **Parcial** | `content_proposals.view_count` (`migrations/021`) y `POST /articles/:slug/view` existen. Sin analítica de lectura ni de escucha. `socialChannels` y `totalReach` se devuelven vacíos **a propósito** |

**Conclusión honesta: 3 de 7 son medibles hoy.** Dos se desbloquean con el punto 9 (`event_date`) y el
punto 16 (motivos). Dos requieren trabajo específico que **no está en el backlog anterior** y debe añadirse
si el negocio las quiere:

| ID extra | Objetivo | Compl. | Clasificación |
|---|---|---|---|
| **R2-50** | Versionar el borrador generado por IA antes de la edición humana, para medir corrección | M | REQUIERE DESARROLLO |
| **R2-51** | Registrar correcciones post-publicación con motivo (reutiliza `reopen` + `reason_code`) | S | AJUSTE MENOR |

### 23.2 Métricas propias del MVP

| Métrica | Fuente | Objetivo de la prueba de 2 semanas |
|---|---|---|
| Señales externas recibidas | `activity_log` acción de ingesta | Establecer línea base (no hay número previo) |
| Tasa de duplicados de la ingesta | respuestas `duplicate` / total | Que el dedupe funcione sin descartar temas legítimos |
| Señales descartadas y su motivo | `activity_log` `reason_code` | ≥50 decisiones tipificadas al final de la prueba |
| Análisis por nivel | `editorial_analyses.analysis_level` | Que nivel 3 sea excepcional (el control de costo funciona) |
| Distribución del CREA Score | `crea_score` por banda | Que las bandas 80-100 / 60-79 / <60 discriminen de verdad |
| **Correlación score ↔ descarte** | cruce de `crea_score` con `reason_code` | **La métrica más importante del MVP**: si los temas de score alto se descartan igual que los bajos, el score está mal ponderado |
| Costo de IA por edición | `GET /api/content/ai-usage` | Que el Motor Editorial no dispare el gasto |
| Ediciones completadas | `newsletter_editions` con `status='enviado'` | 10 en 2 semanas |
| Ítems con trazabilidad completa | `newsletter_edition_items` | 100% |

### 23.3 El criterio cualitativo

El documento cierra con la pregunta correcta, y no se responde con un dashboard:

> *"¿CREA consiguió explicar algo que los demás solamente reportaron?"*

Traducción operativa para la revisión de las dos semanas: **para cada edición, ¿hay al menos un ítem cuyo
valor está en el contexto, los datos o las implicaciones, y no en el hecho?** Si al terminar el MVP la
respuesta es "no" en la mayoría de las ediciones, el problema no será técnico: será que el Motor Editorial
no está produciendo análisis, solo resúmenes más largos. Es la única evaluación que ninguna métrica
automatizable sustituye.

---

## 24. Conclusión

**El documento RADAR 2.0 acierta en su tesis y se queda corto en su elogio.** La plataforma no solo tiene
monitoreo, clasificación, confianza, verificación, propuestas, edición, aprobación, producción, automatización,
métricas y distribución: además tiene resueltas —y funcionando en producción— tres cosas que el documento
plantea como pendientes:

1. **RADAR ya alimenta "Buenos días, Perote"**, excluyendo temas de riesgo y priorizando por confianza
   (`lib/newsletter-content.js:43-51`).
2. **El patrón "objeto editorial → N renders" ya existe** y sostiene el boletín, el texto plano y el podcast
   (`lib/newsletter-template.js`).
3. **El registro obligatorio del motivo** en rechazos y devoluciones ya es política aplicada en código
   (`modules/editorial/index.js:161`, `lib/editorial-review.js:33`).

**La brecha real es una sola, y es conceptual antes que técnica:** entre "esta señal es defendible" y
"escribe la nota" no hay nada. RADAR 1.0 responde *¿es cierto?*. RADAR 2.0 necesita responder
*¿qué significa?*, y ese objeto —el análisis editorial estructurado— no existe en ninguna tabla, en ningún
servicio y en ningún prompt.

Todo lo demás se ordena alrededor de esa pieza. El CREA Score necesita sus campos para calcularse.
"PARA ENTENDER" necesita su nivel 3 para existir. El objeto editorial maestro del multiformato **es**
ese análisis persistido. La Conversación Digital es uno de sus ocho campos, no un módulo aparte. Y el
descubrimiento externo, sin ella, solo aumentaría el caudal del mismo embudo.

**Tres recomendaciones que cambian el resultado del proyecto:**

1. **El Motor Editorial y el objeto editorial maestro son la misma tabla.** Construirlos por separado
   produciría dos objetos "maestros" compitiendo, y sería la peor deuda técnica que este proyecto podría
   adquirir en esta etapa.
2. **El feedback estructurado va primero**, aunque sea el último punto de la lista. Es lo más barato del
   backlog y lo único cuyo valor se pierde con el tiempo.
3. **El MVP no debe esperar a Grok.** Un proveedor simulado valida el contrato igual de bien, y desacoplar
   el MVP de esa investigación es lo que asegura que la arquitectura quede independiente del proveedor —
   que es, textualmente, la recomendación central del documento.

Sobre la calidad de la base: `topic-verification.js` es el mejor módulo del repositorio —puro, testeable,
calibrado y documentado con sus perillas— y no es casualidad que sea el más sólido. **Toda pieza nueva de
RADAR 2.0 debería escribirse con esa misma disciplina**: lógica pura separada del acceso a datos, topes
explícitos, decisiones registradas junto a sus razones, y una prueba ejecutable que falle si algo se rompe.

Si se hace así, RADAR 2.0 no será una plataforma nueva: será la misma, pensando.

---

## 25. Addendum — `Documento Maestro CREA RADAR 2.0 v2` (5 de septiembre de 2026)

**Contexto.** Un día después de esta auditoría apareció una versión nueva del documento de encargo:
`Documento_Maestro_CREA_RADAR_2_0_Karol_v2.docx` (v1.0, 5 sep 2026), ubicado en la misma carpeta que
`CREA_RADAR_2_0_Lineamientos_Karol.docx` (el documento que esta auditoría analizó). **No es una revisión
menor: es un documento distinto y más amplio.** Fusiona el original con otros tres documentos internos
que esta auditoría no tuvo a la vista —`Analisis_Web_CREA_Contenidos_RADAR_2.0.docx` (UX/producto),
`BRIEF-TECNICO-CREA-RADAR-PIPELINE.docx` (backlog P0/P1/P2 de plataforma) y `FODA_CREA_Contenidos_RADAR_2.0.docx`—
y añade documentación oficial de xAI sobre Grok Bot (Overview, FAQ, Skills and routines, Terms; todas
fechadas 2–3 sep 2026).

Esta sección cubre **solo lo que el v2 agrega y que los puntos 9–16 (§5–§13 de este reporte) no cubren**.
No repite lo ya auditado: los 8 campos del Motor Editorial, el CREA Score, Conversación Digital, Buenos
días Perote y Multiformato del v2 son sustancialmente los mismos que en el documento original y sus
veredictos (§5) no cambian. Cada punto nuevo fue verificado contra el código en `master @ 74b5a3b`, igual
que el resto del reporte.

### 25.1 "Distribución real" (P0 del v2) — la brecha que describe **ya no existe**

El v2 trae de `Analisis_Web_CREA_Contenidos_RADAR_2.0.docx` este hallazgo: *"WordPress y Meta aparecen
desconectados; Publicadas vacío"*, y lo marca P0. Verificado contra el código de hoy: **es un hallazgo
obsoleto, ya corregido**, no una brecha vigente.

- `GET /api/admin/integrations` (`modules/auth/index.js:660`) reporta conexión real por presencia de env
  vars, no un array fijo.
- `distribution/index.js:17`: `connected: Boolean(config.wordpressUrl && config.wordpressUser &&
  config.wordpressAppPassword)` — el estado de WordPress ya se deriva de configuración real.
- `POST /api/distribution/wordpress` (`:100-118`) publica de verdad vía REST API con *application password*
  y devuelve la URL canónica del post creado. `POST /distribution/facebook` (Meta) igual.
- La pantalla **Publicadas** existe y lee `published_content` (`producciones.ts:251` `renderPublicadas()`,
  bitácora de migraciones 004+027) — no está vacía por diseño.
- Esta corrección ya estaba **planeada y documentada** antes de esta auditoría:
  `docs/implementaciones/panel_admin_v2.md` (26 ago 2026), secciones 5 y 7, describe exactamente este
  problema y su solución, y el código de hoy coincide con esa solución.

**Conclusión:** el v2 se redactó (o al menos esta sección) sobre el diagnóstico de `Analisis_Web` sin
recotejar contra el estado actual del repo. No requiere backlog nuevo — solo corregir la referencia en el
propio documento de encargo para no reabrir un tema cerrado.

### 25.2 Catálogo y salud de fuentes (P0 del v2) — brecha real, no cubierta por el backlog de §19

Esta sí es una brecha vigente y **nueva respecto a esta auditoría**: ninguno de los ítems R2-01…R2-51
la cubre.

| Tabla | Migración | Campos hoy | Campos que pide el v2 (§4, §6.3.1) |
|---|---|---|---|
| `radar_sources` | 035 | `domain, label, trust, active, notes` | `lastCrawlAt`, `frequency`, `lastError`, `engine`, estado `OK/stale/error` |
| `competitor_facebook_accounts` | 031 | `label, handle_or_url, active` | `platform`, `priority`, `analyze_comments` (bool), `last_scan_at`, `access_status`, `last_error`, `checkpoint` (última publicación procesada) |

Ninguna de las dos tablas tiene columna de salud o de frecuencia. El panel puede mostrar qué fuentes existen,
pero no *cuándo fue revisada por última vez ni si está viva* — exactamente el vacío que señala el v2
(*"el admin sabe qué fuente está viva y cuándo fue revisada"*).

**Además, un hallazgo de datos, no de esquema:** las cuentas semilla cargadas hoy en
`competitor_facebook_accounts` (`migrations/031`) son *Diario de Xalapa*, *AVC Noticias* y *El Dictamen*
— medios **regionales**, no las páginas hiperlocales de Perote que el v2 pide como catálogo mínimo
(§6.3.1: *Perote Noticias*, *Perote al Momento*, *La Voz del Pinahuizapan*, *La Voz del Cofre*). Es un
cambio de datos, no de código, pero condiciona todo lo que el v2 espera del Pulso de Conversación Digital:
hoy el scraper no está apuntando a ninguna de las fuentes que el documento da por sentado.

**Clasificación: REQUIERE DESARROLLO** (esquema) **+ AJUSTE MENOR** (carga de datos).

**Recomendación:** una sola migración aditiva que agregue los campos de salud a ambas tablas (mismo patrón
que 034/035), un job que actualice `last_crawl_at`/`last_error`/estado en cada corte (el cron y el escaneo
manual ya pasan por un punto único: `detectAndSaveTopics()` y el handler de `competitors/detect`), y
sustituir el seed de Facebook por el catálogo de Perote como dato, revisando primero que esas páginas
existan y sean públicas.

### 25.3 Especificación operativa de Grok Bot / "CREA Scout" — insumo nuevo para el punto 10

El documento original solo decía *"pendiente de evaluar"* (§7.1 de este reporte). El v2 aporta una
especificación completa basada en documentación oficial de xAI que **no invalida** el veredicto
REQUIERE INVESTIGACIÓN del punto 10, pero sí responde una parte de lo que `R2-40` tenía que averiguar y
agrega restricciones de diseño concretas que antes no existían:

- **Confirma con fuente oficial** lo que esta auditoría ya recomendaba por diseño propio: navegador
  persistente, sesión conservable, y **CAPTCHA/login se resuelven con intervención humana, nunca se
  saltan** — coincide con `§7.4` de este reporte y con el límite ya vigente en `apps/competitor-scraper`
  (nunca hay bypass de CAPTCHA, solo detección de bloqueo).
- Tres skills concretas (A: escaneo de fuentes, B: clustering/dedupe, C: pulso de conversación) con una
  rutina diaria de una sola ejecución, 45–60 min antes del corte de las 06:30 (America/Mexico_City) de
  "Buenos días, Perote" — esto es una restricción de *timing* que no existía en el documento original y
  que sí debe quedar en `docs/ia/evaluacion-explorer-externo.md` (R2-40) como criterio de diseño.
- Límites obligatorios explícitos (no publicar, no borrar, no cambiar configuración, API key de solo
  ingestión) — coinciden uno a uno con lo que esta auditoría ya recomendaba en §6.4/§7.4 y en las
  salvaguardas de `signal_providers` (R2-11). No cambian el backlog; lo confirman.
- **Un contrato de señal más completo que el original**, con un campo `conversationSnapshot` estructurado
  (§9.1–9.2 del v2: `signalId`, `provider`, `botRunId`, `sourceId`, `accessStatus`
  `ok|login_required|captcha|blocked|error`, `conversationSnapshot{period, sourcesObserved, sampleMethod,
  postsAnalyzed, commentsAnalyzed, themes, recurringQuestions, concerns, claimsToVerify,
  amplificationSignals, limitations}`). Esto es un insumo directo para `R2-03` (contrato de señal) y para
  el diseño de `conversation_analyses` de §10.3 de este reporte — **debería fusionarse en el mismo
  documento de contrato**, no crear uno paralelo.
- Regla explícita nueva: *"las señales externas entran como signal/checking; nunca como verified por el
  solo hecho de venir de Grok"* — refuerza, con las mismas palabras, la salvaguarda que
  `applyTrustFromSources()` ya aplica hoy (§6.3 de este reporte).

**Lo que el v2 sigue sin responder** (y por lo que el punto 10 sigue siendo REQUIERE INVESTIGACIÓN, no
REQUIERE DESARROLLO): costo real por señal, cuota, y si Grok Bot puede efectivamente leer conversación de
X/Twitter con los términos de uso vigentes. Son preguntas de producto/contractuales, no de arquitectura, y
ninguna documentación oficial citada en el v2 las resuelve con un número.

**Recomendación:** ampliar el alcance de `R2-40` para que su entregable incluya explícitamente el timing
de la rutina, las 3 skills y sus límites (ya redactados en el v2, solo hace falta trasladarlos), y fusionar
el `conversationSnapshot` del v2 dentro de `R2-03` en vez de dejarlo como una sección aparte.

### 25.4 Backlog de UX/QA (P2 del v2) — mayormente ya resuelto, verificado en código

El v2 lista, citando `Analisis_Web_CREA_Contenidos_RADAR_2.0.docx`: *"Debug visible, no-eventos, botones
destructivos, fechas US"* y pide *"es-MX, autosave, historial"*. Verificado uno por uno:

| Ítem del v2 | Estado real verificado | Evidencia |
|---|---|---|
| Fechas en formato US | **Ya resuelto** | `toLocaleDateString('es-MX', …)` en `editor.ts:17,193`, `comercial.ts:21,60`, `radar.ts:425` — es-MX en todo el panel |
| Botones destructivos sin confirmar | **Ya resuelto** | Patrón de modal de confirmación (`confirm-delete-published` y equivalentes en `actions.ts`), no `window.confirm` |
| Debug visible en producción | **No encontrado** | `grep` de `console.log`/`debug` sobre `apps/admin/src/screens/*.ts` no devuelve nada |
| Autosave / historial de ediciones | **Confirmado ausente** | No hay ninguna referencia a autosave en `apps/admin/src`. Es el único ítem de esta lista que sigue siendo una brecha real |

**Conclusión:** igual que en §25.1, buena parte de este backlog P2 fue redactado sobre un diagnóstico que
ya no corresponde al estado del repo — probablemente porque `Analisis_Web_CREA_Contenidos_RADAR_2.0.docx`
es anterior a los commits recientes de UX de RADAR (`docs/implementaciones/radar_mejoras.md`, 3 fases).
Lo único que sigue pendiente y es real es **autosave/historial en el editor de notas**.

**Clasificación: AJUSTE MENOR** (un solo ítem real, acotado a `screens/editor.ts`).

### 25.5 ¿Ya existen planes para estas prioridades nuevas?

Revisados `docs/planes/` (`PLAN_v1.md`, `PLAN_PRODUCCION_AGOSTO_2026.md`) y `docs/implementaciones/`
(6 documentos, el más reciente del 26 ago 2026):

- **`docs/planes/`** es infraestructura y operación de despliegue (Dokploy, backups, healthchecks de
  contenedores), no roadmap de producto. No toca ninguno de estos puntos.
- **`docs/implementaciones/panel_admin_v2.md`** es el plan más cercano, y **ya cubre y ya está
  implementado** para el punto 25.1 (integraciones reales, distribución WordPress/Meta) — confirmado
  contra el código en §25.1. No cubre catálogo de fuentes con salud, ni Grok Bot, ni el catálogo semilla
  de Facebook de Perote.
- **Ningún documento del repo** especifica el esquema de salud de fuentes (§25.2), la especificación de
  CREA Scout/Grok Bot (§25.3), o el catálogo semilla de Facebook de Perote (§25.2).

**Conclusión: no hay plan previo para las prioridades nuevas del v2.** Las únicas dos (distribución real,
backlog de UX) que sí tenían plan ya fueron ejecutadas; lo que queda sin planear es exactamente lo que se
agrega como Bloque 9 a continuación.

### 25.6 Backlog nuevo — Bloque 9 (originado en el v2, no en §19)

| ID | Objetivo | Módulo | Archivos / áreas | Depende de | Prioridad | Compl. | Criterio de aceptación | Clasificación |
|---|---|---|---|---|---|---|---|---|
| **R2-52** | Campos de salud en `radar_sources` | api/db | `migrations/052_*.sql` *(nuevo)* — `last_crawl_at`, `last_error`, `engine`, `status` (`ok`/`stale`/`error`) | — | P1 | S | Migración aditiva; `radar-sources` existentes quedan con status `ok` por defecto | REQUIERE DESARROLLO |
| **R2-53** | Campos de salud + checkpoint en `competitor_facebook_accounts` | api/db | `migrations/053_*.sql` *(nuevo)* — `platform`, `priority`, `analyze_comments`, `last_scan_at`, `access_status`, `last_error`, `checkpoint` | — | P1 | S | Mismo patrón aditivo; el scraper actualiza estos campos en cada corte | REQUIERE DESARROLLO |
| **R2-54** | Actualizar `last_crawl_at`/`status`/`last_error` en cada escaneo | api/listening | `modules/listening/index.js` (`competitors/detect`), `lib/topic-detection.js` (`detectAndSaveTopics`) | R2-52, R2-53 | P1 | M | Un fallo de fuente (403, timeout, login wall) queda visible en el panel sin revisar logs | REQUIERE DESARROLLO |
| **R2-55** | Panel: estado de salud por fuente (OK/stale/error) | admin | `screens/radar.ts` (tab Fuentes) | R2-52…R2-54 | P1 | S | Cada fuente muestra su último corte y su último error, con el mismo lenguaje visual que ya usa `confidenceBand` | REQUIERE DESARROLLO |
| **R2-56** | Reemplazar seed de Facebook por catálogo de Perote | api/db | `migrations/054_*.sql` *(nuevo, solo datos)*: Perote Noticias, Perote al Momento, La Voz del Pinahuizapan, La Voz del Cofre | — | **P0** | S | Requiere validar antes que cada URL exista y sea pública; no active páginas sin confirmar | AJUSTE MENOR |
| **R2-57** | Fusionar especificación de CREA Scout (skills, límites, timing) en `R2-40` | docs | `docs/ia/evaluacion-explorer-externo.md` | R2-40 | P1 | S | El documento de evaluación incluye las 3 skills, la ventana horaria y los límites obligatorios del v2 §6, ya redactados | AJUSTE MENOR |
| **R2-58** | Fusionar `conversationSnapshot` del v2 en el contrato de señal | docs | `docs/ia/contrato-senales-externas.md` (`R2-03`) | R2-03 | P1 | S | El contrato de 17 campos incorpora `accessStatus`, `botRunId` y el objeto `conversationSnapshot` completo del v2 §9 | AJUSTE MENOR |
| **R2-59** | Autosave e historial en el editor de notas | admin | `screens/editor.ts` | — | P2 | M | Cambios sin guardar se conservan ante recarga accidental; historial mínimo de versiones por pieza | REQUIERE DESARROLLO |

### 25.7 Encaje en el orden de implementación (§20)

No cambia la secuencia de fases de §20 ni el MVP de §21. Los ítems nuevos se intercalan así:

- **`R2-56`** (catálogo de Facebook de Perote) es dato puro, sin dependencias — puede cargarse en la
  Semana 0 junto con `R2-01…R2-03`, y **debe** ir antes de activar cualquier prueba real del Bloque 8
  (Conversación Digital) o del explorador, porque hoy el scraper apunta a medios equivocados para el
  producto piloto.
- **`R2-52…R2-55`** (salud de fuentes) encajan en el **Bloque 0** de §19: no dependen de nada, y conviene
  tenerlas antes de que el catálogo crezca con la ingesta externa (punto 9) — mismo argumento que ya usa
  la auditoría para `R2-01` (índices) en §18.2.
- **`R2-57` y `R2-58`** son puramente documentales y se resuelven al escribir `R2-03` y `R2-40`, no requieren
  secuencia propia.
- **`R2-59`** (autosave) no bloquea nada del MVP de RADAR 2.0; puede posponerse igual que el resto del
  backlog P2 de esta auditoría.

**El MVP de §21 no cambia de alcance.** Ninguno de estos ítems es indispensable para el recorrido
`DETECCIÓN EXTERNA → RADAR → VERIFICACIÓN → MOTOR EDITORIAL → APROBACIÓN → BUENOS DÍAS, PEROTE`, salvo
`R2-56`: si el piloto quiere mostrar Conversación Digital o cobertura social de Perote con datos reales,
el catálogo de fuentes tiene que apuntar a Perote antes de esa demostración, no después.

---

*Addendum añadido el 7 de septiembre de 2026 sobre `master` @ `74b5a3b` (mismo commit auditado
originalmente), a partir de `Documento_Maestro_CREA_RADAR_2_0_Karol_v2.docx`. Mismo método que el resto
del reporte: cada afirmación se verificó contra el código antes de escribirse; no se modificó ningún
archivo del proyecto ni se ejecutó ninguna migración.*

---

*Auditoría realizada sobre `master` @ `74b5a3b` el 4 de septiembre de 2026. No se modificó ningún archivo
del proyecto ni se ejecutó ninguna migración. Este documento es la única salida de la auditoría, y está
escrito para poder usarse como especificación técnica de implementación.*
