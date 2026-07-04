# PLAN v1 — Desarrollo funcional del apartado público (Editorial + Estudio)

> Documento de trabajo para Claude Code (y demás agentes vía `AGENTS.md`).
> Objetivo: pasar el frontend público de maquetas estáticas con datos hardcodeados
> a una plataforma funcional servida por la API, **sin tocar todavía** los módulos
> de IA (listening / content-engine) ni el panel admin más allá de lo mínimo.

---

## 1. Cómo usar este documento

- Antes de cualquier tarea de este plan, carga la skill **fullstack** (contexto del repo) y la que corresponda a la capa que toques (ver §3).
- Trabaja fase por fase (§5). Cada fase termina con sus criterios de aceptación verificados en local (`docker compose up -d` + API + `npx serve`).
- Aplica el ruleset **ponytail** de `AGENTS.md`: mínimo código que funciona, sin abstracciones no pedidas, sin dependencias nuevas evitables. Toda lógica no trivial deja un check ejecutable.
- Regla de oro del producto: **nada se publica sin aprobación humana**. El sitio público solo lee contenido con `status = 'published'`. Nunca crear un camino de auto-publicación.

## 2. Estado actual (2026-07-01)

### Lo que existe

| Pieza | Estado |
|---|---|
| `apps/web/` (portal + `/estudio`) | Maquetas completas del Claude Design: `index`, `seccion`, `nota`, `perfil`, `comunidad`, `patrocinado` + `estudio/{index,servicios,media-kit,tercer-tiempo,contacto}` |
| `apps/web/assets/js/main.js` | Menú móvil, chips, y **datos placeholder hardcodeados** (`CREA_ARTICLES`, autores) que alimentan sección/perfil |
| `apps/web/assets/css/tokens.css` | Design system real (Paper/Pine/Ochre editorial; Ink/Ochre Estudio dark) — fuente de verdad visual |
| `apps/api/` | Express 4 + `pg` (SQL crudo), `helmet`, `cors`, JWT/bcrypt listos en middleware. 4 routers esqueleto montados en `/api/{listening,content,editorial,distribution}` — todos `// TODO` |
| DB | Postgres 15 (docker), migraciones `001–008`: `users`, `topics`, `content_proposals`, `published_content`, `clients`, `client_content`, `reports`, `competitor_posts` |
| `apps/admin/` | Maqueta estática del panel (fuera de alcance de v1 salvo lo indicado) |

### Brechas que este plan cierra

1. **No hay API pública de lectura.** El portal renderiza arrays hardcodeados en `main.js`.
2. **El modelo de datos no cubre lo que el portal pinta.** `content_proposals` no tiene `slug`, `section`, `dek`, `author`, imagen de portada; `published_content` es solo métrica por plataforma. Falta la forma canónica de "artículo publicado en el sitio".
3. **Estudio sin backend.** `estudio/contacto.html` no envía a ningún lado; no existe tabla de leads.
4. **Sin rate limiting** en ningún endpoint (gap ya señalado en la skill `security`) — crítico en cuanto exista un POST público (formulario de contacto).

## 3. Skills del proyecto — cuándo cargar cada una

Las skills viven en `skills/` (canónico, symlink a `.claude/skills` y `.opencode/skills`).

| Skill | Cárgala cuando… |
|---|---|
| `fullstack` | **Siempre**, antes de cualquier cambio de código o decisión de arquitectura |
| `crea-design-system` | Cualquier cambio visual en `apps/web/` — tokens, tipografía (Roboto Slab + Inter), Cofre de Perote, tono por sección |
| `database` | Nuevas tablas/columnas/seeds — convención `apps/api/src/db/migrations/00N_*.sql` |
| `security` | Antes de agregar **cualquier** endpoint (sobre todo los públicos de este plan), path de publicación o dependencia que toque input de usuario |
| `automation-pipeline` | Fases posteriores (cron, listening→engine→editorial→distribution). En v1 solo como contexto del gate editorial |
| `frontend-review` | Antes de dar por cerrada cada fase con cambios en HTML/CSS/JS |
| `responsive` | Junto con `frontend-review` — mobile-first, la mayoría del tráfico editorial es teléfono |
| `css-cleanup` | Si una fase deja CSS duplicado o valores hardcodeados fuera de `tokens.css` |

Complementos disponibles: `/ponytail-review` (plugin ponytail) para revisión de deuda/simplicidad; `/code-review` sobre el diff antes de commit; skill `verify` para ejercitar el flujo end-to-end tras cada fase.

## 4. Alcance v1

**Dentro:** API pública de lectura, modelo de artículos publicados, portada/sección/nota/perfil servidas por datos reales, formulario de contacto de Estudio con persistencia, rate limiting en la superficie pública, seeds realistas para desarrollo.

**Fuera (no implementar aunque sea tentador):** integración Perplexity/Claude/Apify, panel admin funcional completo, autenticación de lectores, comentarios/comunidad interactiva, newsletter real, pagos/patrocinios transaccionales, publicación a Facebook/WhatsApp.

## 5. Fases

### Fase 0 — Modelo de datos del artículo público

La forma canónica de lo que el sitio pinta. Extender lo que existe, no duplicar.

- [x] Migración `009_extend_content_for_web.sql`:
  - `content_proposals`: agregar `slug TEXT UNIQUE`, `section TEXT`, `dek TEXT`, `author_name TEXT`, `cover_image_url TEXT`, `published_at TIMESTAMPTZ`.
  - El estado de publicación en el sitio es `content_proposals.status = 'published'` + `published_at` — `published_content` sigue siendo el registro por plataforma/métricas (el sitio es una plataforma más: `platform = 'web'`).
- [x] Índices: `(status, section, published_at DESC)` y único en `slug`.
- [x] Seed `002_web_articles.sql` con los ~24 artículos de `CREA_ARTICLES` (main.js) como filas `status='published'` — misma data, ahora en DB. Secciones: Local, Cultura, Economía, Entretenimiento, Deportes, Opinión.
- **Aceptación:** `npm run migrate && npm run seed` idempotente; `SELECT slug, section FROM content_proposals WHERE status='published'` regresa el catálogo completo.

### Fase 1 — API pública de lectura

Router nuevo `apps/api/src/modules/public/` montado en `/api/public` (patrón existente: router + README de una línea). Solo lectura, sin auth, **solo** `status='published'`.

- [x] `GET /api/public/articles?section=&limit=&offset=` — listado (portada y sección).
- [x] `GET /api/public/articles/:slug` — nota completa (404 si no publicado).
- [x] `GET /api/public/authors/:name/articles` — para `perfil.html` (derivado de `author_name`; no crear tabla de autores todavía — YAGNI).
- [x] Rate limiting en toda la superficie `/api/public` (revisar skill `security`; preferir `express-rate-limit`, dependencia única y estándar).
- [x] CORS: en dev el portal corre en `:4000` y la API en `:3000` — verificar que la config actual de `cors` lo permite y documentar la de producción en `.env.example`.
- **Aceptación:** `curl` a los tres endpoints regresa la data del seed; un artículo `status='pending'` NUNCA aparece; el rate limit responde 429 bajo ráfaga.

### Fase 2 — Portal editorial consumiendo la API

Sustituir `CREA_ARTICLES` por `fetch` a `/api/public`. Vanilla JS, sin framework ni build (restricción del stack, no preferencia).

- [x] `main.js`: helper único `creaApi(path)` con base URL configurable (meta tag o constante) y manejo de error visible (estado vacío con tono de marca, no pantalla rota).
- [x] `index.html` (portada), `seccion.html`, `nota.html` (por `slug` en querystring), `perfil.html` — datos desde API. Eliminar `CREA_ARTICLES` al terminar (deletion over addition).
- [x] `patrocinado.html` y `comunidad.html` quedan estáticas en v1 — solo verificar que no rompen al quitar el placeholder compartido.
- **Aceptación:** con API arriba, las 4 páginas pintan datos del seed; con API abajo, muestran estado vacío digno; `frontend-review` + `responsive` pasadas.

### Fase 3 — Estudio funcional (contacto + leads)

- [x] Migración `010_create_leads.sql`: `leads(id, name, email, company, service_interest, message, source_page, created_at)`.
- [x] `POST /api/public/leads` — validación de input en la frontera (campos requeridos, longitudes, formato email), rate limit estricto, sin auth. **Cargar skill `security` antes.**
- [x] `estudio/contacto.html`: submit vía fetch, estados éxito/error accesibles, honeypot anti-spam simple (campo oculto — cero dependencias).
- [x] `media-kit.html`, `servicios.html`, `tercer-tiempo.html`: quedan estáticas; CTAs apuntan a contacto.
- **Aceptación:** enviar el formulario crea fila en `leads`; input inválido responde 400 con mensaje claro; honeypot descarta bots silenciosamente.

### Fase 4 — Cierre de calidad

- [x] SEO básico: `<title>`/description por página, Open Graph en `nota.html` (server-side no hay — documentar la limitación de páginas estáticas y dejarla explícita, no "resolverla" con SSR fuera de alcance).
- [x] Accesibilidad: landmarks, alt, foco visible, contraste contra `tokens.css`.
- [x] `css-cleanup` si las fases dejaron estilos sueltos.
- [x] `verify` end-to-end: portada → sección → nota → perfil → estudio → contacto.
- [x] Actualizar `README.md` (endpoints públicos nuevos) y las skills `fullstack`/`database`/`security` si cambió lo que documentan.
- **Aceptación:** flujo completo verificado en mobile y desktop; `/code-review` del diff sin hallazgos severos.

## 6. Convenciones no negociables

1. **Gate editorial:** el público solo ve `status='published'`. Ningún endpoint público escribe en tablas de contenido.
2. **Migraciones:** solo hacia adelante, `00N_nombre.sql`, idempotentes (`IF NOT EXISTS`), nunca editar una migración ya aplicada.
3. **Secrets:** en `apps/api/.env` (gitignored); toda key nueva también en `.env.example` con placeholder.
4. **Visual:** todo color/espaciado desde `tokens.css`. Nada hardcodeado.
5. **Dependencias:** justificar cada una contra la escalera ponytail. En este plan la única prevista es `express-rate-limit`.
6. **Checks:** cada endpoint nuevo deja al menos un check ejecutable (script o test mínimo, sin frameworks nuevos).

## 7. Referencias

- Brief de diseño: `~/Descargas/CREA_Brief_Diseno_ClaudeDesign.md` (paleta/tipografía v2, distinta a v1).
- `crea_web` (repo hermano) = v1: **solo referencia de alcance**, no fuente de código — schema y API distintos.
- Especificación por módulo: `apps/api/src/modules/<capa>/README.md`.
