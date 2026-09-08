# Fase 8 — Conversación Digital (punto 13)

> Depende de: investigación propia (adquisición de datos) · Prioridad: **P2 / REQUIERE
> INVESTIGACIÓN antes de cualquier desarrollo** · Es la única fase con exposición legal directa —
> va al final a propósito.

## Por qué esta fase es distinta a todas las demás

En el resto de RADAR 2.0, la parte de análisis es la difícil y el dato ya existe. **Aquí es al
revés**: agregar comentarios por categorías con un modelo es trivial (`enrichFacebookTopics()` ya
lo hace sobre texto recolectado). **El problema es la adquisición**, y no se resuelve escribiendo
código.

## Qué existe hoy

| Pieza | Guarda | No guarda |
|---|---|---|
| `competitor_posts` (`migrations/008`) | `post_text`, `reactions`, `comments` (INTEGER), `shares`, `views` | Ningún comentario real, solo el conteo |
| `apps/competitor-scraper/src/facebook.js:25-27` | Posts de páginas de Facebook | **Descarta los comentarios deliberadamente** — el scraper conserva solo los `article` externos para no tratar un comentario como post |
| `topics.sentiment` | Etiqueta del modelo sobre el tema | No es un agregado de opiniones reales |

**Conclusión: no existe ningún dato de conversación reutilizable hoy.** No falta el análisis, falta
el insumo.

## Los tres frentes sin resolver (en este orden)

1. **Vía técnica.** Graph API permite leer comentarios de la **página propia** con permisos
   adecuados (`FACEBOOK_PAGE_ID`+`FACEBOOK_PAGE_ACCESS_TOKEN` ya existen, se usan para publicar).
   Para páginas de terceros **no hay vía oficial**.
2. **Vía actual, y su fragilidad.** El scraper de cookies (`apps/competitor-scraper/`) es el mayor
   riesgo operativo del sistema hoy: cookies de sesión personal que caducan cada 30-90 días.
   Ampliarlo a comentarios multiplica volumen scrapeado y probabilidad de bloqueo.
3. **Legal y de producto.** Comentarios de terceros son datos de personas identificables. La
   restricción correcta ("interesa lo que se dice, no quién lo dice"; *analizar → categorizar →
   agregar → descartar identidad*) debe ser una restricción de diseño **desde el schema**, no un
   filtro añadido después.

## Tareas

### R2-44 — Investigación de adquisición de comentarios

- **Módulo:** `docs`
- **Archivo:** `docs/ia/conversacion-digital-adquisicion.md` *(nuevo)*
- **Debe comparar:** Graph API sobre página propia vs. terceros vs. no hacerlo, con lectura legal
  y de riesgo operativo (impacto de ampliar el volumen scrapeado sobre el riesgo de bloqueo ya
  documentado en `apps/competitor-scraper/README.md`).
- **Criterio de aceptación:** recomendación explícita: adoptar (y con qué método), aplazar, o
  descartar el módulo completo.
- **Clasificación:** REQUIERE INVESTIGACIÓN. **Ninguna tarea de esta fase avanza sin este
  documento cerrado.**

### R2-45 — Política de minimización de datos

- **Módulo:** `docs`
- **Archivo:** mismo documento de `R2-44`
- **Hacer:** definir qué se guarda, qué no, cuánto tiempo, y qué se descarta tras el análisis.
- **Criterio de aceptación:** la política es lo suficientemente concreta como para convertirse
  directamente en el diseño de tabla de `R2-47` (campos permitidos vs. prohibidos).
- **Clasificación:** REQUIERE INVESTIGACIÓN.

### R2-46 — Captura de comentarios (según lo que decida `R2-44`)

- **Módulo:** `scraper` o `api`
- **Archivos:** `apps/competitor-scraper/src/facebook.js:25-27` **o** un cliente nuevo de Graph API
  — la elección depende enteramente de `R2-44`
- **Hacer:** el corpus se procesa en memoria y se descarta. Si por costo hiciera falta cachearlo,
  con TTL corto y borrado garantizado. **No se persiste identidad de personas.**
- **Criterio de aceptación:** ningún dato personal identificable sobrevive más allá del análisis.
- **Clasificación:** REQUIERE DESARROLLO — condicionado a `R2-44`/`R2-45`.

### R2-47 — Tabla y servicio de análisis de conversación

- **Módulo:** `api`
- **Archivos:** `apps/api/src/db/migrations/0NN_conversation_analyses.sql` *(nuevo)*,
  `apps/api/src/lib/conversation-analysis.js` *(nuevo)*
- **Hacer:**
  ```sql
  CREATE TABLE IF NOT EXISTS conversation_analyses (
    id SERIAL PRIMARY KEY,
    topic_id INTEGER NOT NULL REFERENCES topics(id),
    period_start TIMESTAMPTZ, period_end TIMESTAMPTZ,
    sources JSONB,
    posts_analyzed INTEGER NOT NULL,
    comments_analyzed INTEGER NOT NULL,
    recurring_themes JSONB, questions JSONB, concerns JSONB, criticisms JSONB,
    support JSONB, disagreements JSONB, claims_to_verify JSONB, unanswered JSONB,
    method_note TEXT NOT NULL,
    model TEXT, provider TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ```
  **No** crear una tabla de comentarios individuales con autor — es la decisión que después no se
  puede deshacer. Se guarda **el agregado**, nunca el corpus. Si hace falta conservar citas
  textuales: sin autor, sin URL de perfil, sin identificador, longitud acotada (mismo patrón que
  `normalizeEvidence()` en `topic-verification.js:17`).
- **`method_note` es `NOT NULL` a propósito** — el texto fijo: *"Este análisis corresponde a
  comentarios públicos observados en redes sociales y no constituye una encuesta ni representa
  estadísticamente la opinión de la población."* Si el campo es obligatorio en la tabla, ningún
  render puede omitirlo por descuido.
- **Criterio de aceptación:** `posts_analyzed` y `comments_analyzed` son obligatorios y siempre se
  muestran junto a cualquier distribución. Prohibir porcentajes bajo un mínimo de muestra —
  precedente ya vigente: el panel de métricas devuelve `socialChannels: []` y `totalReach: null`
  a propósito *"en vez de simular números"* (`modules/editorial/index.js:376-378`).
- **Clasificación:** REQUIERE DESARROLLO — condicionado a `R2-44`/`R2-45`.

### R2-48 — Alimentar el campo 6 del Motor Editorial y el factor de score

- **Módulo:** `api/lib`
- **Archivos:** `lib/editorial-engine.js` (fase `03`), `lib/crea-score.js` (fase `04`)
- **Hacer:** "¿Qué se está diciendo?" se llena desde `conversation_analyses`. **No es un módulo
  aparte** — es un proveedor de un campo que ya existe en `editorial_analyses`. Diseñarlo como
  módulo independiente duplicaría la ficha editorial.
- **Criterio de aceptación:** el campo 6 se llena solo cuando hay un análisis de conversación; si
  no lo hay, queda explícitamente vacío (nunca se rellena con `sentiment` o `mentions`).
- **Clasificación:** REQUIERE DESARROLLO.

### R2-49 — Panel con salvaguardas visuales

- **Módulo:** `admin`
- **Archivo:** `apps/admin/src/screens/radar.ts`
- **Hacer:** la nota metodológica debe ser imposible de omitir en el render; ninguna distribución
  se muestra sin su tamaño de muestra visible junto a ella.
- **Criterio de aceptación:** no existe ninguna vista donde se vea un porcentaje o distribución sin
  el denominador junto a él.
- **Clasificación:** REQUIERE DESARROLLO.

## Riesgo editorial — el más severo de todo RADAR 2.0

**Presentar una muestra como opinión pública.** Un agregado de comentarios de Facebook no
representa a Perote. Nunca escribir "Perote piensa..." — usar "En la conversación digital
observada...", siempre con fuentes, periodo y tamaño de muestra visibles. Distinción obligatoria
para cualquier texto generado desde esta fase:

| Concepto | Uso correcto |
|---|---|
| Pulso de conversación digital | Corpus observable, muestra no probabilística, describe temas/preguntas/narrativas en ese corpus |
| Vox populi | Expresión coloquial — no es un método de medición, no usar como si lo fuera |
| Opinión pública | Requiere encuestas representativas o estudio formal — RADAR **nunca** etiqueta el pulso digital como esto |

## Qué NO hacer

- No escribir ni una línea de `R2-46` en adelante sin `R2-44`/`R2-45` cerrados.
- No crear tabla de comentarios con autor, bajo ninguna circunstancia.
- No mostrar porcentajes de comentarios como si fueran porcentajes de población.
- No convertir esta fase en un módulo aparte del Motor Editorial.

## Verificación

```bash
cd apps/api && node scripts/run-checks.js unit
```

Revisión editorial manual: cada salida de texto que use datos de `conversation_analyses` debe
poder mostrar, sin buscarlo, cuántos posts y comentarios se analizaron y en qué periodo.
