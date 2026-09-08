# Fase 6 — Multiformato (punto 15)

> Depende de: `03-motor-editorial.md` (el objeto maestro es `editorial_analyses`) · Posterior al
> MVP · Prioridad: **P1** · Puede ir en paralelo con `07-explorer-grok.md`.

## El patrón ya existe — no se inventa, se generaliza

El error a evitar en esta fase es diseñar arquitectura nueva. **El patrón correcto ya está
implementado, probado en producción y sirviendo lectores reales** — solo que únicamente dentro del
newsletter:

- `newsletter_editions.content` es un objeto único en JSONB.
- `lib/newsletter-template.js` expone **tres funciones puras** que lo renderizan: `renderNewsletterHtml()`,
  `renderNewsletterText()`, `renderPodcastScript()`.
- Editar el objeto (`PATCH /pending`) y volver a renderizar es la operación normal.

El trabajo de esta fase es **generalizar `newsletter-template.js` al resto del sistema**, no
reinventarlo.

## Qué existe hoy por formato (fuera del newsletter)

| Formato | Estado | Cómo se produce |
|---|---|---|
| WEB | Sí | `content_proposals` con `status='published'`, leída por el portal Astro |
| WHATSAPP | Sí, mínimo | `título + dek + url`, link `wa.me` — no es un texto pensado para el canal |
| AUDIO | Solo newsletter | `renderPodcastScript()` → ElevenLabs. Una nota no tiene versión en audio |
| SOCIAL (Facebook) | Sí, mínimo | `message = title + dek`, con link |

**El problema real:** cada formato para notas es un `POST /api/content/generate-proposal`
independiente, con su propia llamada de IA y su propia fila en `content_proposals`. Comparten
`topic_id` y nada más. Si el editor corrige un dato en la nota, el post generado antes no se
entera — es exactamente el escenario de "cinco investigaciones independientes" que este proyecto
busca eliminar.

## Tareas

### R2-36 — `lib/renders/` con funciones puras por canal

- **Módulo:** `api/lib`
- **Archivo:** `apps/api/src/lib/renders/*.js` *(nuevo)*, generalizando `lib/newsletter-template.js`
- **Hacer:** una función pura por canal (`web.js`, `whatsapp.js`, `audio.js`, `social.js`).
  Entrada = objeto maestro (`editorial_analyses` + el tema), salida = string. **Sin acceso a DB,
  sin llamadas a IA cuando no hagan falta** — misma disciplina que los tres renderers actuales.
  Se prueban sin infraestructura.
- **Criterio de aceptación:** cada render es una función pura testeable con un objeto de entrada
  fijo, sin mocks de red ni DB.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-37 — Persistir renders con versión del análisis

- **Módulo:** `api/db`
- **Archivo:** `apps/api/src/db/migrations/0NN_content_renders.sql` *(nuevo)*
- **Hacer:** cada render guarda `analysis_id` y `analysis_version` (o timestamp del análisis usado).
  Si el análisis avanza (nueva fila en `editorial_analyses` para el mismo tema), los renders
  quedan marcados como desactualizados.
- **Criterio de aceptación:** un cambio en el análisis es detectable en cada render derivado.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-38 — Regeneración explícita desde el panel

- **Módulo:** `api` + `admin`
- **Archivos:** `modules/content-engine/index.js`, `apps/admin/src/screens/editor.ts`
- **Hacer:** el editor ve qué renders quedaron desactualizados y regenera uno a uno. **Nunca
  automático sobre contenido ya publicado** — publicar sigue siendo la puerta editorial y no se
  salta.
- **Criterio de aceptación:** regenerar es siempre una decisión humana explícita, nunca un efecto
  secundario de otra acción.
- **Clasificación:** REQUIERE DESARROLLO. Prioridad P2.

### R2-39 — WHATSAPP_RENDER y SOCIAL_RENDER propios

- **Módulo:** `api/distribution`
- **Archivos:** `modules/distribution/index.js:96-105` (WhatsApp), `:76-92` (Facebook)
- **Hacer:** dejan de ser "título + dek + link": se genera una pieza propia por canal desde el
  objeto maestro (`R2-36`). La bitácora `published_content` no cambia de forma.
- **Criterio de aceptación:** el mensaje de WhatsApp y el post de Facebook ya no son la nota
  recortada, sino un empaque pensado para ese canal.
- **Clasificación:** REQUIERE DESARROLLO. Prioridad P2 — mejora de empaque, no de flujo.

## Qué NO hacer

- No crear un segundo objeto "maestro" distinto de `editorial_analyses`. Si en el camino parece que
  hace falta uno, es señal de que algo en la fase `03` quedó incompleto — vuelve ahí, no dupliques.
- No dejar que un render se regenere automáticamente sobre una pieza ya publicada.
- No meter llamadas a `pool.query` dentro de las funciones de `lib/renders/` — deben poder
  probarse sin base de datos, igual que `newsletter-template.js`.

## Verificación

```bash
cd apps/api
node scripts/run-checks.js unit
cd ../admin && npx tsc --noEmit && npm test
```

Cada archivo de `lib/renders/` debe tener su propio test de función pura (entrada fija → salida
esperada), sin necesidad de levantar la API ni la base de datos.

## Siguiente fase

No hay dependencia hacia adelante — esta fase y `07-explorer-grok.md` son las dos ramas
posteriores al MVP y pueden ejecutarse en cualquier orden entre sí.
