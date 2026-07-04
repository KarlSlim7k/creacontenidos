# Panel Admin v1 — Implementación con IA (Nous Portal)

> Primer mes de pruebas. Solo texto. Sin publicación real.
> Objetivo: validar el pipeline completo RADAR → propuesta → borrador → QA → aprobación.

---

## Arquitectura de modelos

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ DeepSeek     │     │ MiniMax M3   │     │ GPT-5 Nano  │
│ V4 Flash     │     │              │     │             │
│ (default)    │     │ (complejo)   │     │ (QA final)  │
└──────┬───────┘     └──────┬───────┘     └──────┬──────┘
       │                    │                    │
       ▼                    ▼                    ▼
  Generación de       Generación de        Verificación
  borradores,         contenido            final: español
  propuestas,         complejo:            limpio, sin
  RADAR analysis      guiones,             símbolos
                      análisis             erróneos
                      profundo
```

**Proveedor único**: Nous Portal Plus ($20/mes, $22 de crédito).
Los tres modelos se accesan vía la misma API key de Portal.

### Cuándo se usa cada modelo

| Modelo | Uso | Precio (Portal) |
|--------|-----|-----------------|
| `deepseek/deepseek-v4-flash` | Default para todo: RADAR analysis, borradores, propuestas, resúmenes | $0.14/M in, $0.28/M out |
| `minimax/minimax-m3` | Contenido complejo: guiones, análisis extenso, piezas largas (>1500 palabras) | $0.30/M in, $1.20/M out |
| `openai/gpt-5-nano` | QA final de todo texto antes de pasar a aprobación | $0.05/M in, $0.40/M out |

### Configuración en `.env`

```env
# Ya existe en config/index.js
NOUS_PORTAL_API_KEY=nous_...        # Nuevo: key del Portal
NOUS_PORTAL_BASE_URL=https://api.nousresearch.com/v1  # Nuevo: base URL

# Modelos por tarea (con defaults)
AI_MODEL_DEFAULT=deepseek/deepseek-v4-flash
AI_MODEL_COMPLEX=minimax/minimax-m3
AI_MODEL_QA=openai/gpt-5-nano
```

---

## Fase 1 — RADAR manual

### Qué hace
Botón "Buscar tendencias" en el panel RADAR. Al hacer click:
1. Llama al backend con el contexto de Perote/CREA
2. El backend usa web search (vía Portal) para buscar tendencias relevantes
3. DeepSeek analiza los resultados y genera topics estructurados
4. Se guardan en la tabla `topics`
5. El panel se refresca mostrando los nuevos topics

### Endpoint nuevo

```
POST /api/listening/topics/detect
```

**Body** (opcional):
```json
{
  "query": "tendencias educación Puebla 2026"  // override del query default
}
```

**Roles**: director, produccion

**Flujo interno**:
1. Construir queries de búsqueda (default: contexto regional de Perote/CREA, o el query del body)
2. Llamar a web search del Portal (Firecrawl backend) — 2-3 queries
3. Pasar resultados a DeepSeek con prompt de extracción de topics
4. Guardar topics nuevos en BD (evitar duplicados por título similar)
5. Devolver topics creados

**Response**:
```json
{
  "detected": 3,
  "topics": [
    {
      "id": 12,
      "title": "Nuevo festival cultural en...",
      "source": "Web Search",
      "mentions": 1,
      "sentiment": "positivo",
      "status": "Nuevo",
      "antecedentes": "...",
      "actores": "...",
      "angulos": "...",
      "audiencia": "..."
    }
  ]
}
```

### Archivos a modificar/crear

| Archivo | Acción |
|---------|--------|
| `apps/api/src/config/index.js` | Agregar `nousPortalKey`, `nousBaseUrl`, `aiModelDefault`, `aiModelComplex`, `aiModelQa` |
| `apps/api/src/modules/listening/index.js` | Agregar `POST /topics/detect` con lógica de web search + AI |
| `apps/api/src/lib/ai-client.js` | **Nuevo**: cliente HTTP para Nous Portal (OpenAI-compatible). Funciones: `chatComplete(messages, model)`, `webSearch(query)` |
| `apps/admin/assets/js/panel.js` | Agregar botón "Buscar tendencias" en `renderRadar()`, loading state, refresh al recibir respuesta |

### Límites de prueba
- Máximo 2 detecciones por sesión de usuario (frontend: deshabilitar botón después de 2 clicks)
- Sin cron jobs ni detección automática
- Tokens estimados por detección: ~$0.02-0.05 (2-3 web searches + análisis DeepSeek)

---

## Fase 2 — Content Engine (generación de propuestas)

### Qué hace
Generar propuestas de contenido a partir de topics del RADAR o de ideas de la bandeja.

### Endpoint nuevo

```
POST /api/content/generate-proposal
```

**Body**:
```json
{
  "topic_id": 12,           // o "idea_id": 5 — uno de los dos requerido
  "format": "nota",         // nota | post | guion_audio | guion_video | meme
  "angle": "humano"         // ángulo editorial opcional
}
```

**Roles**: director, produccion

**Flujo**:
1. Cargar topic o idea desde BD
2. Llamar a DeepSeek con prompt de generación de propuesta (formato, ángulo, contexto de CREA)
3. Devolver propuesta estructurada (title, body, dek, section, angulo, sensibilidad)
4. Guardar como `content_proposals` con status `propuesta`

**Modelo**: DeepSeek default. Si `format` es `guion_audio` o `guion_video`, usar MiniMax M3.

### Archivos a modificar/crear

| Archivo | Acción |
|---------|--------|
| `apps/api/src/modules/content-engine/index.js` | Implementar router con `POST /generate-proposal` |
| `apps/api/src/lib/ai-client.js` | Función `generateProposal(context, format, angle)` |
| `apps/admin/assets/js/panel.js` | Botón "Generar propuesta IA" en detalle de RADAR y en bandeja de ideas |

---

## Fase 3 — Editor con generación IA

### Qué hace
Reemplazar el texto hardcodeado del botón "Generar borrador con IA" en el editor de nota por una llamada real a DeepSeek.

### Endpoint nuevo

```
POST /api/content/generate-draft
```

**Body**:
```json
{
  "proposal_id": 15,
  "instructions": "enfoque humano, tono cercano"  // opcional
}
```

**Roles**: cualquier usuario autenticado (solo sobre sus propias propuestas en status `borrador`)

**Flujo**:
1. Cargar propuesta desde BD
2. Llamar a DeepSeek con el título, ángulo, sección, y contexto
3. Devolver body extendido (artículo completo)
4. Frontend inserta en el textarea del editor

### Archivos a modificar

| Archivo | Acción |
|---------|--------|
| `apps/api/src/modules/content-engine/index.js` | Agregar `POST /generate-draft` |
| `apps/admin/assets/js/panel.js` | Reemplazar texto hardcodeado `draftLocal`/`draftSonnet` por llamada real al endpoint |

---

## Fase 4 — QA final (verificación de calidad)

### Qué hace
Antes de enviar a revisión (`submit-review`), pasar el texto por GPT-5 Nano para:
1. Verificar que el español sea correcto y natural
2. Detectar símbolos o caracteres no deseados (CJK, emojis colados, etc.)
3. Marcar posibles errores factuales o de coherencia
4. Devolver score de calidad + sugerencias

### Endpoint nuevo

```
POST /api/content/qa-check
```

**Body**:
```json
{
  "proposal_id": 15
}
```

**Response**:
```json
{
  "score": 85,
  "issues": [
    { "type": "symbol", "line": 3, "text": "carácter no válido: 你" },
    { "type": "grammar", "line": 7, "text": "posible error: 'haiga' → 'haya'" }
  ],
  "summary": "Texto con buena calidad. 1 símbolo no deseado detectado."
}
```

**Modelo**: GPT-5 Nano (el más barato, suficiente para QA léxico/gramatical)

### Archivos a modificar

| Archivo | Acción |
|---------|--------|
| `apps/api/src/modules/content-engine/index.js` | Agregar `POST /qa-check` |
| `apps/admin/assets/js/panel.js` | Botón "Verificar texto" visible en editor cuando status=`borrador`. Muestra panel de resultados inline |

---

## Fase 5 — Distribución (placeholder estructurado)

### Qué hacer (solo preparar, NO implementar todavía)
Dejar el módulo `distribution/index.js` listo para cuando haya APIs reales:
- Documentar los endpoints que se necesitarán (publish to Facebook, WhatsApp link, WordPress)
- Dejar comentarios con los servicios que se usarían (Meta Graph API, WordPress REST API)
- NO consumir tokens en pruebas de distribución

---

## Resumen de archivos impactados

### Backend (apps/api/src/)

```
src/
├── config/index.js              ← Agregar env vars de Nous Portal + modelos
├── lib/ai-client.js             ← NUEVO: cliente para Portal (chat + web search)
├── modules/
│   ├── content-engine/index.js  ← Implementar: generate-proposal, generate-draft, qa-check
│   └── listening/index.js       ← Agregar: POST /topics/detect
```

### Frontend (apps/admin/)

```
assets/js/panel.js               ← Modificar:
                                    - renderRadar(): botón "Buscar tendencias"
                                    - renderEditor(): botón "Generar borrador con IA" real
                                    - Nuevo: botón "Verificar texto" en editor
                                    - renderRadarDetail(): botón "Generar propuesta IA"
```

### Docs

```
docs/implementaciones/panel_admin_v1.md  ← Este archivo
```

---

## Presupuesto estimado (mes de pruebas)

| Concepto | Cantidad estimada | Costo estimado |
|----------|-------------------|----------------|
| Nous Portal Plus | 1 mes | $20.00 |
| RADAR detect (2/día × 30 días) | 60 detecciones | $1.50-3.00 |
| Generación de propuestas | ~50 propuestas | $1.00-2.00 |
| Generación de borradores | ~30 borradores | $2.00-4.00 |
| QA final (GPT-5 Nano) | ~80 verificaciones | $0.50-1.00 |
| **Total** | | **$25-30** |

---

## Orden de implementación

1. `lib/ai-client.js` — cliente base para Portal (todo lo demás depende de esto)
2. `listening/index.js` — RADAR detect endpoint
3. `panel.js` — botón RADAR + wiring
4. `content-engine/index.js` — generate-proposal
5. `panel.js` — botón generar propuesta desde RADAR/ideas
6. `content-engine/index.js` — generate-draft
7. `panel.js` — reemplazar hardcode en editor
8. `content-engine/index.js` — qa-check
9. `panel.js` — botón verificar texto + panel de resultados
10. Testing end-to-end del pipeline completo

---

## Decisiones de diseño

- **OpenAI-compatible API**: Nous Portal usa formato OpenAI (`/v1/chat/completions`), así que el cliente es un `fetch` simple, no SDK.
- **Sin cola de jobs**: todo síncrono. Las generaciones son rápidas (<5s con DeepSeek) y es para pruebas.
- **Sin streaming**: respuesta completa. El panel muestra loading spinner hasta recibir respuesta.
- **Deduplicación de topics**: antes de insertar en BD, comparar título normalizado (lowercase, sin acentos) contra topics existentes de las últimas 24h.
- **Rate limit en frontend**: botón se deshabilita después de 2 clicks por sesión para RADAR (no backend enforcement en pruebas).
- **QA no bloqueante**: el check es opcional, no impide enviar a revisión. Es una herramienta de apoyo.
