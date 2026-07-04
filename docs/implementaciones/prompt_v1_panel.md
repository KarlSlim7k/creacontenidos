# Prompt para agente IA — Panel Admin v1 (IA + RADAR)

Copia desde aquí ↓

---

## Contexto del proyecto

Estás trabajando en **CREA Contenidos**, un monorepo para un equipo de contenido editorial en Perote, Puebla (México). El stack es:

- **Backend**: Express 4 + PostgreSQL 16 (Docker) → `apps/api/`
- **Frontend admin**: Vanilla JS SPA (sin framework) → `apps/admin/assets/js/panel.js` (1200+ líneas, un solo IIFE)
- **Autenticación**: JWT con 4 roles: director (acceso total), produccion, comercial, colaborador
- **Config**: `apps/api/src/config/index.js` (dotenv)
- **Migraciones SQL**: `apps/api/src/db/migrations/` (001-016 existentes)
- **Módulos API**: `apps/api/src/modules/` — auth, editorial, listening, content-engine, commercial, social, distribution, public

El usuario ya tiene una suscripción activa a **Nous Portal Plus** y la API key ya está en `.env` como `NOUS_PORTAL_API_KEY`.

## IMPORTANTE — Lee estos archivos primero

Antes de escribir cualquier código, lee estos archivos para entender los patrones existentes:

1. `apps/api/src/modules/editorial/index.js` — patrón de endpoints (async/await, pool.query, requireAuth, requireRole, manejo de errores)
2. `apps/api/src/modules/listening/index.js` — endpoint actual de RADAR (solo lectura)
3. `apps/api/src/modules/content-engine/index.js` — módulo vacío que vas a implementar
4. `apps/api/src/modules/distribution/index.js` — módulo vacío (solo documentación)
5. `apps/api/src/modules/auth/index.js` — patrón de endpoints de auth
6. `apps/api/src/modules/auth/role-modules.js` — mapeo de roles a módulos
7. `apps/api/src/middleware/auth.js` — requireAuth, requireRole
8. `apps/api/src/server.js` — cómo se montan los routers (contentEngineRouter ya está montado en `/api/content`)
9. `apps/api/src/config/index.js` — variables de entorno actuales
10. `apps/admin/assets/js/panel.js` — TODO el frontend (lee completo, es un solo archivo IIFE)

## Convenciones que DEBES seguir

- NO uses TypeScript. Todo es JavaScript vanilla CommonJS (require/module.exports)
- NO uses frameworks en frontend. Todo es vanilla JS con string-template HTML
- Los endpoints usan `async (req, res, next)` con try/catch que llama `next(err)`
- Las queries usan `pool.query()` con parámetros posicionales ($1, $2...)
- Los roles se validan con `requireRole('director', 'produccion')` middleware
- El frontend usa `adminApi(path, opts)` para todas las llamadas (ya definido)
- El frontend usa `setState(patch)` para actualizar estado y re-renderizar
- Los handlers de click están en `handleClick()` con un switch/case por `data-action`
- Usa `esc()` para escapar HTML en el frontend
- Usa `badge()` para badges de estado
- Usa `loadingCard()` para estados de carga
- NO agregues dependencias npm. Todo con lo que ya está instalado (express, pg, bcrypt, jsonwebtoken, helmet, cors, dotenv)
- Las migraciones SQL van en `apps/api/src/db/migrations/` con formato `NNN_descripcion.sql`
- El idioma de la UI y los comentarios es español
- Nous Portal usa formato OpenAI-compatible (`/v1/chat/completions`), así que el cliente HTTP es un `fetch` simple, NO necesitas SDK

## Arquitectura de modelos

La suscripción Nous Portal da acceso a 300+ modelos vía una sola API key. Para este proyecto usamos 3 modelos:

| Modelo (ID para la API) | Uso | Cuándo |
|---|---|---|
| `deepseek/deepseek-v4-flash` | Default para todo: RADAR, borradores, propuestas, resúmenes | Siempre excepto los casos de abajo |
| `minimax/minimax-m3` | Contenido complejo: guiones de audio/video, análisis extenso (>1500 palabras) | Cuando format es `guion_audio` o `guion_video` |
| `openai/gpt-5-nano` | QA final: verificar español, detectar símbolos CJK, errores gramaticales | Solo en endpoint qa-check |

**Base URL de Nous Portal**: `https://inference-api.nousresearch.com/v1`

El endpoint de chat es: `POST https://inference-api.nousresearch.com/v1/chat/completions`
El endpoint de web search se hace a través del chat pidiéndole al modelo que busque, O puedes usar la Tool Gateway. Para simplificar, usa el modelo directamente con prompts que simulen la búsqueda (el modelo tiene conocimiento actualizado).

## Tareas a implementar

### Tarea 1: Cliente de IA (`ai-client.js`)

**Crear** `apps/api/src/lib/ai-client.js`:

Este módulo exporta funciones que hablan con Nous Portal. Es la base de todo lo demás.

```javascript
// Estructura sugerida:

const NOUS_BASE = 'https://inference-api.nousresearch.com/v1';
const NOUS_KEY = process.env.NOUS_PORTAL_API_KEY;

// Modelos disponibles
const MODELS = {
  default: process.env.AI_MODEL_DEFAULT || 'deepseek/deepseek-v4-flash',
  complex: process.env.AI_MODEL_COMPLEX || 'minimax/minimax-m3',
  qa: process.env.AI_MODEL_QA || 'openai/gpt-5-nano',
};

/**
 * Llamada genérica a chat/completions
 * @param {string} systemPrompt - instrucción del sistema
 * @param {string} userMessage - mensaje del usuario
 * @param {string} modelKey - 'default' | 'complex' | 'qa'
 * @returns {string} contenido de la respuesta
 */
async function chatComplete(systemPrompt, userMessage, modelKey = 'default') { ... }

/**
 * Detectar topics de tendencia vía web search simulada + análisis IA
 * @param {string} query - tema de búsqueda
 * @returns {Array} topics detectados
 */
async function detectTopics(query) { ... }

/**
 * Generar propuesta de contenido
 * @param {object} context - { title, description, category, source, antecedentes, actores, angulos, audiencia }
 * @param {string} format - 'nota' | 'post' | 'guion_audio' | 'guion_video' | 'meme'
 * @param {string} angle - ángulo editorial opcional
 * @returns {object} { title, body, dek, section, angulo, sensibilidad }
 */
async function generateProposal(context, format, angle) { ... }

/**
 * Generar borrador extendido
 * @param {object} proposal - { title, dek, section, angulo, body }
 * @param {string} instructions - instrucciones opcionales del editor
 * @returns {string} body extendido del artículo
 */
async function generateDraft(proposal, instructions) { ... }

/**
 * QA final: verificar calidad del texto
 * @param {string} title
 * @param {string} body
 * @returns {object} { score, issues: [{type, line, text}], summary }
 */
async function qaCheck(title, body) { ... }
```

**Implementación de `chatComplete`**:
- Hacer fetch a `${NOUS_BASE}/chat/completions`
- Headers: `Authorization: Bearer ${NOUS_KEY}`, `Content-Type: application/json`
- Body: `{ model: MODELS[modelKey], messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], temperature: 0.7, max_tokens: 4096 }`
- Parsear response.choices[0].message.content
- Manejar errores HTTP (401, 429, 500+)

**Implementación de `detectTopics`**:
- System prompt: "Eres un analista de tendencias para un medio editorial en Perote, Puebla, México. Detectas temas relevantes para audiencia local y regional."
- User message: "Analiza las siguientes tendencias y extrae los topics más relevantes para un medio de contenido en Perote, Puebla. Para cada topic, devuelve un JSON array con objetos que tengan: title, source (Web Search), mentions (número estimado), sentiment (positivo/negativo/neutral), antecedentes, actores, angulos (ángulos de cobertura sugeridos), audiencia (potencial de audiencia). Devuelve SOLO el JSON array, sin texto adicional. Máximo 5 topics."
- Parsear el JSON de la respuesta (manejar posibles errores de parseo)
- Devolver el array

**Implementación de `generateProposal`**:
- Seleccionar modelo: si format es 'guion_audio' o 'guion_video' → 'complex', sino → 'default'
- System prompt: "Eres un editor asistente para CREA Contenidos, un medio digital en Perote, Puebla. Generas propuestas de contenido en español mexicano profesional."
- User message con el contexto del topic/idea + el formato pedido
- Pedir JSON con: title, body (resumen de 2-3 párrafos), dek (subtítulo de 1 línea), section, angulo, sensibilidad (verde/amarillo/rojo)
- Devolver el objeto parseado

**Implementación de `generateDraft`**:
- Modelo: 'default'
- System prompt: "Eres un redactor para CREA Contenidos, medio digital en Perote, Puebla. Escribes artículos completos en español mexicano, tono profesional pero accesible. NO uses emojis. NO uses caracteres CJK o no latinos."
- User message con título, sección, ángulo, dek, e instrucciones del editor
- Devolver el texto del body directamente (string, no JSON)

**Implementación de `qaCheck`**:
- Modelo: 'qa' (GPT-5 Nano)
- System prompt: "Eres un corrector de estilo para un medio editorial mexicano. Verificas: 1) Español correcto (gramática, ortografía), 2) Ausencia de caracteres no deseados (CJK, símbolos extraños, emojis colados), 3) Coherencia y fluidez. Devuelve un JSON con: score (0-100), issues (array de {type: 'symbol'|'grammar'|'coherence', line: número de línea, text: descripción}), summary (resumen en 1 línea). SOLO el JSON."
- User message: el título + body del artículo
- Parsear y devolver el objeto

**Agregar env vars a `apps/api/src/config/index.js`**:
```javascript
nousPortalKey: process.env.NOUS_PORTAL_API_KEY,
aiModelDefault: process.env.AI_MODEL_DEFAULT || 'deepseek/deepseek-v4-flash',
aiModelComplex: process.env.AI_MODEL_COMPLEX || 'minimax/minimax-m3',
aiModelQa: process.env.AI_MODEL_QA || 'openai/gpt-5-nano',
```

### Tarea 2: Tabla activity_log

**Crear migración** `apps/api/src/db/migrations/017_create_activity_log.sql`:
```sql
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  detail TEXT,
  user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'exito',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Crear helper** en `apps/api/src/lib/ai-client.js` (o en un archivo separado `apps/api/src/lib/activity.js`):
```javascript
/**
 * Registrar actividad en el log
 */
async function logActivity(pool, action, detail, userId, status = 'exito', metadata = null) {
  await pool.query(
    'INSERT INTO activity_log (action, detail, user_id, status, metadata) VALUES ($1, $2, $3, $4, $5)',
    [action, detail, userId, status, metadata ? JSON.stringify(metadata) : null]
  );
}
```

Este helper se llama al final de cada acción del content engine (RADAR detect, generate proposal, generate draft, QA check).

### Tarea 3: RADAR — detección manual

**Backend** — En `apps/api/src/modules/listening/index.js`, agregar después del GET existente:

```
POST /api/listening/topics/detect
```

- Roles: `requireRole('director', 'produccion')`
- Body opcional: `{ query: "tendencias educación Puebla 2026" }`
- Si no hay query, usar default: "tendencias y noticias relevantes en Perote, Puebla, México"
- Flujo:
  1. Llamar `detectTopics(query)` de ai-client.js
  2. Para cada topic retornado, hacer INSERT en tabla `topics` (verificar duplicados por título similar en últimas 24h — comparar lowercase del título)
  3. Registrar en activity_log: action='radar_detect', detail='X topics detectados', metadata={query, count}
  4. Devolver `{ detected: count, topics: [...] }`
- Si la llamada a IA falla, registrar en activity_log con status='fallo' y devolver 500 con mensaje descriptivo

**Frontend** — En `panel.js`:

En el state inicial, agregar: `radarBusy: false`

En `renderRadar()`, después de los chips de filtro y antes de la tabla:
- Agregar botón: `<button type="button" class="padmin-btn padmin-btn-sm" data-action="detect-radar" ${state.radarBusy ? 'disabled' : ''}>${state.radarBusy ? 'Buscando…' : '🔍 Buscar tendencias'}</button>`
- Si el rol no es director ni produccion, no mostrar el botón

En `handleClick()`, agregar case:
```
case 'detect-radar':
  setState({ radarBusy: true });
  adminApi('/api/listening/topics/detect', { method: 'POST' })
    .then(function (res) {
      // Refrescar topics desde BD
      return adminApi('/api/listening/topics');
    })
    .then(function (topics) {
      setState({ radarBusy: false, data: Object.assign({}, state.data, { topics: topics }) });
    })
    .catch(function (err) {
      setState({ radarBusy: false, errorMsg: err.message });
    });
  break;
```

### Tarea 4: Generar propuesta desde RADAR

**Backend** — En `apps/api/src/modules/content-engine/index.js`:

```
POST /api/content/generate-proposal
```

- Roles: `requireRole('director', 'produccion')`
- Body: `{ topic_id: 12, format: "nota", angle: "humano" }`
- `topic_id` es requerido (por ahora solo desde topic, no desde idea)
- `format` default: "nota"
- Flujo:
  1. Cargar topic desde BD: `SELECT * FROM topics WHERE id = $1`
  2. Si no existe, 404
  3. Llamar `generateProposal(topicData, format, angle)` de ai-client.js
  4. Insertar en `content_proposals` con status='propuesta', origin='Generado con IA'
  5. Registrar en activity_log
  6. Devolver la propuesta creada

**Frontend** — En `panel.js`:

En el state inicial, agregar: `generatingProposal: false`

En `renderRadarDetail()` (el drawer que se abre al hacer click en un topic), al final del drawer antes de cerrar:
- Agregar botón: "Generar propuesta IA" con select de formato (nota, post, guion_audio, guion_video) y botón de acción
- Solo visible para director y produccion
- Loading state mientras genera

En `handleClick()`, agregar case `generate-proposal-from-topic`:
```
case 'generate-proposal-from-topic':
  var topicId = Number(el.getAttribute('data-id'));
  var format = document.getElementById('proposal-format-' + topicId);
  setState({ generatingProposal: true });
  adminApi('/api/content/generate-proposal', {
    method: 'POST',
    body: { topic_id: topicId, format: format ? format.value : 'nota' }
  })
    .then(function (proposal) {
      setState({ generatingProposal: false, selectedRadarId: null });
      alert('Propuesta creada: ' + proposal.title);
      // Invalidar cache de propuestas
      state.data.proposalsByKey = {};
    })
    .catch(function (err) {
      setState({ generatingProposal: false, errorMsg: err.message });
    });
  break;
```

### Tarea 5: Generar borrador con IA en el editor

**Backend** — En `apps/api/src/modules/content-engine/index.js`:

```
POST /api/content/generate-draft
```

- Roles: cualquier autenticado
- Body: `{ proposal_id: 15, instructions: "enfoque humano" }`
- `proposal_id` requerido, `instructions` opcional
- Flujo:
  1. Cargar propuesta: `SELECT * FROM content_proposals WHERE id = $1`
  2. Verificar que status sea 'borrador' (solo se puede generar borrador en ese estado)
  3. Si no, 409
  4. Llamar `generateDraft(proposal, instructions)` de ai-client.js
  5. Actualizar el body de la propuesta: `UPDATE content_proposals SET body = $1, updated_at = now() WHERE id = $2`
  6. Registrar en activity_log
  7. Devolver `{ body: "..." }`

**Frontend** — En `panel.js`:

El editor ya tiene un botón "Generar borrador con IA" que actualmente hace esto (hardcodeado):
```javascript
case 'generate-draft':
  if (state.editorDraft) {
    state.editorDraft.body = state.draftModel === 'sonnet' ? draftSonnet : draftLocal;
    setState({ demoNote: 'editor' });
  }
  break;
```

Reemplazar ese case con:
```javascript
case 'generate-draft':
  if (!state.editorProposalId) break;
  setState({ generatingDraft: true });
  adminApi('/api/content/generate-draft', {
    method: 'POST',
    body: { proposal_id: state.editorProposalId }
  })
    .then(function (res) {
      if (state.editorDraft) {
        state.editorDraft.body = res.body;
      }
      setState({ generatingDraft: false, demoNote: 'editor' });
    })
    .catch(function (err) {
      setState({ generatingDraft: false, errorMsg: err.message });
    });
  break;
```

En el state inicial, agregar: `generatingDraft: false`

En `renderEditor()`, donde está el botón "Generar borrador con IA":
- Cambiar el texto si `state.generatingDraft` es true → "Generando…"
- Agregar `disabled` si `state.generatingDraft` es true
- Eliminar el select de modelo (draftModel: 'local'/'sonnet') ya que ahora es real

También puedes eliminar las variables hardcodeadas `draftLocal` y `draftSonnet` ya que no se usarán más.

### Tarea 6: QA final — verificar texto

**Backend** — En `apps/api/src/modules/content-engine/index.js`:

```
POST /api/content/qa-check
```

- Roles: cualquier autenticado
- Body: `{ proposal_id: 15 }`
- Flujo:
  1. Cargar propuesta
  2. Verificar que tenga body (no vacío)
  3. Llamar `qaCheck(proposal.title, proposal.body)` de ai-client.js
  4. Registrar en activity_log: action='qa_check', metadata={score, issueCount}
  5. Devolver `{ score, issues, summary }`

**Frontend** — En `panel.js`:

En el state inicial, agregar: `qaResult: null, qaBusy: false`

En `renderEditor()`, cuando hay un draft abierto (editorDraft no es null), agregar un botón "Verificar texto" debajo del botón de guardar:
- Visible solo cuando `editorDraft.body` tiene contenido
- Loading si `state.qaBusy`
- Si `state.qaResult` existe, mostrar panel inline debajo:
  - Score con color (verde >80, amarillo 50-80, rojo <50)
  - Lista de issues (tipo + línea + descripción)
  - Summary
  - Botón "Cerrar resultados"

En `handleClick()`, agregar cases:
```
case 'run-qa':
  if (!state.editorProposalId) break;
  setState({ qaBusy: true, qaResult: null });
  adminApi('/api/content/qa-check', { method: 'POST', body: { proposal_id: state.editorProposalId } })
    .then(function (res) {
      setState({ qaBusy: false, qaResult: res });
    })
    .catch(function (err) {
      setState({ qaBusy: false, errorMsg: err.message });
    });
  break;
case 'close-qa':
  setState({ qaResult: null });
  break;
```

### Tarea 7: Distribución (solo documentación)

En `apps/api/src/modules/distribution/index.js`, reemplazar el TODO actual con documentación de endpoints futuros:

```javascript
const express = require('express');
const router = express.Router();

// === Endpoints futuros (no implementar todavía) ===
//
// POST /distribution/facebook
//   Publica un artículo en Facebook Page via Meta Graph API.
//   Requiere: FACEBOOK_APP_TOKEN en .env
//   Body: { proposal_id, page_id }
//   Flujo: cargar propuesta → formatear para Facebook → POST a Graph API → registrar resultado
//
// POST /distribution/whatsapp
//   Genera un link de WhatsApp Newsletter para compartir.
//   Requiere: número de WhatsApp configurado
//   Body: { proposal_id }
//   Flujo: cargar propuesta → generar link wa.me/?text=... → devolver link
//
// POST /distribution/wordpress
//   Publica un artículo en WordPress via REST API.
//   Requiere: WORDPRESS_URL, WORDPRESS_USER, WORDPRESS_APP_PASSWORD en .env
//   Body: { proposal_id }
//   Flujo: cargar propuesta → POST a /wp-json/wp/v2/posts → registrar post_id externo

module.exports = router;
```

## Orden de implementación

1. **Tarea 1** (ai-client.js + config) — todo lo demás depende de esto
2. **Tarea 2** (activity_log migration + helper) — base para logging
3. **Tarea 3** (RADAR detect) — primer endpoint que usa ai-client
4. **Tarea 4** (generate proposal) — segundo endpoint
5. **Tarea 5** (generate draft) — tercer endpoint + reemplaza hardcode
6. **Tarea 6** (QA check) — cuarto endpoint + botón en editor
7. **Tarea 7** (distribución docs) — 2 minutos

## Validación

Después de cada tarea:
1. Verificar que la migración SQL corre: `node apps/api/src/db/migrate.js`
2. Verificar que el endpoint responde correctamente (usar curl o el panel)
3. Verificar que el frontend renderiza sin errores en consola del navegador
4. Verificar que los permisos de rol funcionan

Al final de todo:
- Levantar el servidor: `cd apps/api && node src/server.js`
- Abrir el panel admin en el navegador
- Login como director (email: director@crearcontenidos.com, contraseña: crea2026)
- Ir a RADAR → hacer click en "Buscar tendencias" → verificar que aparecen topics nuevos
- Click en un topic → "Generar propuesta IA" → verificar que se crea la propuesta
- Ir a Propuestas IA → aprobar la propuesta nueva
- Ir a Editor → seleccionar la propuesta → "Generar borrador con IA" → verificar que el body se llena
- "Verificar texto" → verificar que muestra score e issues
- Guardar → Enviar a revisión
- Ir a Hermes → verificar que muestra las 4 acciones recientes en el log
- Verificar que no quedan `draftLocal`, `draftSonnet` hardcodeados en el panel
- Verificar que no quedan `STATIC_NOTE` en el panel
