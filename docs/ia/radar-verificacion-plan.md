# Plan de desarrollo — RADAR verificación editorial

**Estado:** plan aprobado para implementación local iterativa  
**Fecha:** 2026-07-18  
**Prototipo de referencia UX:** `preview-radar.html` (sandbox; no es producción)  
**Destino de producto:** capa listening + panel admin RADAR  
**Principio:** RADAR maximiza **temas defendibles**, no cantidad de temas detectados.

---

## 1. Problema

La detección de temas (Perplexity / Firecrawl + markdown / Facebook → `topics`) no evalúa hoy:

- si el hallazgo es rumor, clickbait o engagement bait;
- si hay fuente primaria o corroboración;
- qué se sabe vs qué no se sabe;
- si el interés social (mentions/viralidad) es señal o ruido.

Eso contamina la agenda editorial, quema tokens en propuestas inútiles y satura el panel. El gate humano de **publicación** ya existe; falta un **filtro de calidad en listening** (antes del content-engine).

---

## 2. Estado actual (baseline)

### 2.1 Datos (`topics`)

| Origen | Campos relevantes |
|--------|-------------------|
| `002_create_topics.sql` | `title`, `source`, `mentions`, `sentiment`, `status` (default `Nuevo` vía `023`), `detected_at` |
| `013_extend_topics_for_radar.sql` | `antecedentes`, `actores`, `angulos`, `audiencia` |

`status` editorial de workflow: **`Nuevo` | `Revisado`**. No hay score de confianza ni estados de verificación.

### 2.2 Detección

| Path | Archivo | Comportamiento |
|------|---------|----------------|
| Manual + cron | `apps/api/src/lib/topic-detection.js` | Firecrawl si hay key+URLs; fallback Perplexity; dedupe `lower(title)` + 24h; INSERT sin campos de verificación |
| Prompts web/markdown | `apps/api/src/lib/ai-client.js` → `detectTopics`, `detectTopicsFromMarkdown` | JSON: title, source, mentions, sentiment, antecedentes, actores, angulos, audiencia |
| Facebook → topics | `listening/index.js` + `enrichFacebookTopics` | Mismo shape de ficha; `source='Facebook'`; mentions = reactions+comments+shares |
| Cron | `listening-cron.js` | Cada 6h; solo detecta y guarda; no genera propuestas |

### 2.3 API listening

- `GET /api/listening/topics` — lista (filtro source/status)
- `POST /api/listening/topics/detect`
- `PATCH /api/listening/topics/:id/approve` → `status='Revisado'`
- `DELETE /api/listening/topics/:id`

### 2.4 Content-engine

- `POST /api/content/generate-proposal` — canibalización (`similarity` / pg_trgm) y contexto de competencia; **no mira calidad del topic**.

### 2.5 UI admin

- `apps/admin/src/screens/radar.ts` — tabla: tema, fuente, menciones, sentimiento, estado (`Nuevo`/`Revisado`)
- Ficha: antecedentes, actores, ángulos, audiencia + generar propuesta / aprobar / eliminar
- Tabs: Temas | Competencia (no tab Fuentes)
- Tipos: `Topic` en `apps/admin/src/store.ts`

### 2.6 Checks

- `npm run check:listening` → `scripts/check-listening.js` (cron export, canibalización 409, sección, ai-usage). **No** cubre scoring ni gate por confianza.

### 2.7 Prototipo

`preview-radar.html` en raíz del repo: UX objetivo (métricas, estados de verificación, score, ficha de evidencia). Es **punto de partida visual** y de lenguaje editorial; la implementación real vive en API + admin.

---

## 3. Objetivo de producto

1. Cada topic nuevo nace con **confianza (0–100)** y **estado de verificación** derivados de reglas + IA.
2. El panel muestra y filtra por esos estados (como el preview).
3. La ficha explica **qué se sabe**, **evidencia/fuentes**, **señales de riesgo**, **decisión editorial sugerida**.
4. Generar propuesta IA se restringe o advierte según umbral (gate en content-engine).
5. Iteración **local primero**: migrar, detectar, ver en admin, ajustar prompts/umbrales, ampliar checks. El HTML prototipo se actualiza solo si ayuda a validar UX; el destino es el panel real.

---

## 4. Modelo de dominio

### 4.1 Dos ejes de “estado” (no colapsar en uno)

| Eje | Campo | Valores | Quién lo mueve |
|-----|--------|---------|----------------|
| **Workflow humano** | `status` (existente) | `Nuevo`, `Revisado` | Editor (aprobar) / sistema al crear |
| **Verificación** | `verification_status` (nuevo) | `verified`, `checking`, `signal`, `risk` | Detección (IA + reglas); editor puede override opcional en fase posterior |

Mapeo UX (preview → código):

| Preview | `verification_status` | Significado |
|---------|----------------------|------------|
| VERIFICADO | `verified` | Multi-fuente o fuente primaria clara; listo para propuesta |
| EN VERIFICACIÓN | `checking` | Hecho plausible, falta evidencia o geoloc / corroboración |
| SEÑAL | `signal` | Interés local débil o incompleto; no es noticia redonda aún |
| RIESGO ALTO | `risk` | Rumor, clickbait, sin cifra/autoridad, fuente débil |

### 4.2 Score de confianza

- Campo: `confidence` — `SMALLINT` 0–100 (nullable solo para filas legacy pre-migración; nuevas siempre rellenadas).
- Bandas UI (preview): alto ≥ 75, medio 40–74, bajo &lt; 40.
- **No** usar `mentions` como proxy de confianza. Interés social y confianza son ortogonales (columna “Interés” vs “Confianza” en preview).

### 4.3 Campos nuevos de ficha (mínimo viable)

| Campo | Tipo | Uso |
|-------|------|-----|
| `confidence` | smallint | Score 0–100 |
| `verification_status` | text | `verified` \| `checking` \| `signal` \| `risk` |
| `known_facts` | text | “Qué se sabe” (narrativo corto) |
| `unknown_facts` | text | “Qué no se sabe” (opcional pero recomendado) |
| `evidence` | jsonb | Array de fuentes: `{ label, url?, kind, supports?, reliable? }` |
| `risk_flags` | jsonb | Array de strings o `{ code, message }` |
| `editorial_decision` | text | Sugerencia: apto / no apto / condicionado + por qué |
| `source_count` | smallint | Conteo de fuentes independientes (derivado o reportado por IA) |

**Legacy:** `antecedentes` / `actores` / `angulos` / `audiencia` se mantienen. La ficha nueva **añade** secciones; no borra las actuales en la primera PR.

### 4.4 Criterios de elegibilidad (Fase 0 — reglas de negocio)

Señales **positivas** (suben score):

- Fuente primaria (comunicado oficial, acta, autoridad nombrada).
- ≥2 fuentes independientes que respaldan el mismo hecho.
- Hecho fechado (día/hora o ventana clara).
- Sin lenguaje especulativo (“se dice”, “al parecer”, “fuentes anónimas” sin más).

Señales **negativas** (bajan score / risk):

- Solo viralidad en redes, sin corroboración.
- Titular alarmista sin cifra, lugar verificable o autoridad.
- Contenido reciclado / sin fecha / año anterior presentado como actual (ya hay instrucción de frescura; reforzar).
- Una sola fuente opaca o cuenta de reenvíos.

**Umbrales iniciales (ajustables en local):**

| Condición | `verification_status` sugerido | `confidence` |
|-----------|-------------------------------|--------------|
| Primaria + corroboración o score ≥ 75 y sin risk flags graves | `verified` | 75–100 |
| Hecho creíble, 1 fuente o falta dato clave | `checking` | 40–74 |
| Señal local incompleta (fecha/sede/etc.) | `signal` | 40–70 |
| Rumor / clickbait / sin fundamento | `risk` | 0–39 |

La IA propone; reglas de código pueden **capear** (ej. si `source_count < 2` y no hay tag de fuente primaria → no permitir `verified` aunque el modelo diga 95).

---

## 5. Estrategia de implementación (local-first)

```
preview-radar.html  →  referencia UX / lenguaje
        ↓
   DB + prompts + topic-detection  (datos reales)
        ↓
   GET topics + admin radar.ts     (panel local)
        ↓
   gate generate-proposal
        ↓
   checks + ajuste de umbrales
```

- **No** portar el CSS monolítico del preview al admin; reutilizar tokens/clases del panel (`padmin-*`).
- Tras cada fase: `npm run migrate` + API + admin en local + `check:listening` (ampliado cuando toque).
- El prototipo se puede ir alineando a campos reales **solo si** ayuda a demos; no es fuente de verdad del schema.

---

## 6. Fases de desarrollo

### Fase 0 — Criterios cerrados (doc only)

**Entregable:** esta sección 4 + checklist en README de listening (opcional 2–3 líneas).  
**Código:** ninguno.  
**Criterio de salida:** el equipo acepta labels, umbrales y que `status` workflow ≠ `verification_status`.

---

### Fase 1 — Schema + API de lectura + ficha UI (sin cambiar prompts aún)

**Objetivo:** el panel puede **mostrar** confianza y verificación (null-safe para topics viejos).

**Migración** `034_extend_topics_verification.sql` (número final = siguiente libre al implementar):

```sql
-- sketch
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS confidence SMALLINT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT,
  ADD COLUMN IF NOT EXISTS known_facts TEXT,
  ADD COLUMN IF NOT EXISTS unknown_facts TEXT,
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS editorial_decision TEXT,
  ADD COLUMN IF NOT EXISTS source_count SMALLINT;
-- constraint opcional: verification_status IN (...)
-- check confidence BETWEEN 0 AND 100 OR NULL
```

**Archivos:**

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/db/migrations/034_*.sql` | columnas nuevas |
| `apps/api/src/modules/listening/index.js` | SELECT incluye campos nuevos; GET sin romper clientes |
| `apps/admin/src/store.ts` | `Topic` ampliado |
| `apps/admin/src/screens/radar.ts` | columnas Confianza + estado verificación; ficha con secciones preview; filtros por verification |
| `apps/api/src/modules/listening/README.md` | documentar campos |
| Seed (opcional) | 3–5 topics de ejemplo con distintos estados para UI sin gastar IA |

**Comportamiento:**

- Topics legacy: `confidence` null → UI muestra “—” o “sin evaluar”.
- Métricas resumen (cards del preview): **conteos client-side** en admin a partir del listado (sin endpoint nuevo en esta fase).
- Tab “Fuentes” del preview: **fuera de esta fase** (Fase 4).

**Criterio de salida:** con seed o UPDATE manual en SQL, el panel muestra score, badges y ficha; `check:listening` sigue en verde.

---

### Fase 2 — Scoring en detección (prompts + persistencia)

**Objetivo:** todo topic **nuevo** sale con verificación rellenada.

**Archivos:**

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/lib/ai-client.js` | Extender JSON de `detectTopics`, `detectTopicsFromMarkdown`, `enrichFacebookTopics` con campos de verificación |
| `apps/api/src/lib/topic-detection.js` | INSERT con nuevos campos; helper `normalizeVerification(topic)` (clamp score, map status, cap verified sin multi-fuente) |
| `apps/api/src/modules/listening/index.js` | Path Facebook: mismo INSERT normalizado (ideal: extraer `insertTopic` compartido para no duplicar) |
| Prompts | Instrucciones: penalizar rumor/clickbait; exigir evidence array; no inventar URLs; si no hay fecha, bajar score |

**Shape JSON esperado del modelo (además de lo actual):**

```json
{
  "title": "...",
  "source": "Web Search",
  "mentions": 0,
  "sentiment": "neutral",
  "antecedentes": "...",
  "actores": "...",
  "angulos": "...",
  "audiencia": "...",
  "confidence": 72,
  "verification_status": "checking",
  "known_facts": "...",
  "unknown_facts": "...",
  "evidence": [
    { "label": "CMAS Perote", "url": null, "kind": "primary", "supports": "corte y horario", "reliable": true }
  ],
  "risk_flags": ["single_source"],
  "editorial_decision": "Condicionado: confirmar con autoridad antes de titular afirmativo.",
  "source_count": 1
}
```

**Reglas de código post-IA (mínimas, YAGNI):**

1. `confidence = clamp(0, 100, Number(confidence) || 0)`.
2. Si `verification_status` inválido → derivar de confidence + risk_flags.
3. Si `source_count < 2` y ninguna evidence `kind==='primary'` → forzar no-`verified` (bajar a `checking` o `signal`).
4. Si hay flag de rumor/clickbait explícito → `risk` y cap confidence ≤ 39.

**No** filtrar en silencio todos los `risk` en la primera iteración: **guardarlos** con badge rojo para calibrar falsos positivos. Opción futura: env `RADAR_DROP_RISK=1` o umbral.

**Criterio de salida:** `POST /topics/detect` en local inserta filas con confidence y evidence; ficha admin legible; logs `radar_detect` sin secretos.

---

### Fase 3 — Multi-fuente y calidad de agenda

**Objetivo:** reforzar score con señales estructurales, no solo el monólogo del modelo.

**Ideas concretas (elegir mínimo al implementar):**

1. Si Firecrawl scrapeó N URLs y el topic cita ≥2 de ellas → bonus a `source_count` / confidence.
2. Dedupe mejorado: no solo título exacto 24h; considerar títulos similares (`similarity` o normalización) para no inflar la lista con el mismo rumor.
3. Merge suave: si llega un topic `signal` y luego otro similar con evidencia mejor → actualizar el existente (fase opcional; puede ser solo documentada si es cara).

**Archivos:** `topic-detection.js`, posiblemente queries en listening; **no** tabla nueva todavía.

**Criterio de salida:** al menos una regla multi-fuente automatizada medible en check unitario del helper (sin API de pago).

---

### Fase 4 — Lista de fuentes (whitelist / penalización)

**Objetivo:** tab “Fuentes” del preview + config usable.

**Mínimo viable:**

- Tabla `radar_sources` o config en env CSV ya existente (`FIRECRAWL_SOURCE_URLS`) documentada como “fuentes confiables de scrape”.
- Opcional: tabla simple `(domain, label, trust: high|medium|low, active)` + CRUD admin solo director.
- Al detectar: si la URL de evidence cae en domain high → bonus; low → malus.

**Fuera de alcance inicial:** anti-desinformación global, ML de credibilidad, TikTok productor real.

**Criterio de salida:** al menos lectura de lista + efecto en score documentado; UI tab puede ser lista read-only al principio.

---

### Fase 5 — Gate en content-engine

**Objetivo:** no gastar tokens en basura sin fricción explícita.

**Archivo:** `apps/api/src/modules/content-engine/index.js`

| `verification_status` | Comportamiento propuesto |
|----------------------|---------------------------|
| `verified` | Generar normal |
| `checking` / `signal` | Generar solo con `{ force: true }` **o** permitir con warning en response (decidir una; default: **permitir con warning** en body, bloquear solo `risk`) |
| `risk` | **409** con mensaje claro; override `{ force: true }` + rol director/produccion (igual que canibalización) |
| null (legacy) | Permitir (compat) o tratar como `checking` |

**UI:** en ficha, deshabilitar o etiquetar “Generar propuesta” si `risk` (mostrar que requiere force / confirmación).

**Checks:** extender `check-listening.js` o `check-content-engine.js` con topic `risk` → 409 sin force; con force → 201 (mock de generateProposal si hace falta para no gastar IA — o solo assert del guard antes del call).

**Criterio de salida:** guard testeable sin proveedor de IA real (inyectar topic en DB + short-circuit o spy).

---

### Fase 6 — Medir y calibrar

**Métricas simples (activity_log o queries):**

- % topics por `verification_status` (últimos 7/30 días).
- % propuestas generadas desde `risk` / `signal` (debería bajar).
- Rechazos humanos posteriores (manual / nota en editorial) — si no hay dato, al menos muestreo editorial.

Ajustar umbrales y prompts; no añadir dashboard complejo si con SQL + log basta.

---

## 7. Orden de PRs recomendado

| PR | Fase | Título tentativo | Depende de |
|----|------|------------------|------------|
| PR1 | 1 | `topics`: columnas de verificación + API GET + UI ficha/score | — |
| PR2 | 2 | Detección: prompts + normalize + INSERT | PR1 |
| PR3 | 5 | Gate `generate-proposal` por `verification_status` | PR1 (ideal PR2) |
| PR4 | 3 | Reglas multi-fuente / dedupe calidad | PR2 |
| PR5 | 4 | Fuentes confiables (tabla o config + UI mínima) | PR2 |
| PR6 | 6 | Checks ampliados + doc de calibración | PR3+ |

Cada PR mergeable en local con `npm run check:listening` (y panel build si aplica) en verde.

---

## 8. Archivos tocados (mapa completo)

### Casi siempre

- `apps/api/src/db/migrations/034_extend_topics_verification.sql` (nombre/número al implementar)
- `apps/api/src/lib/topic-detection.js`
- `apps/api/src/lib/ai-client.js`
- `apps/api/src/modules/listening/index.js`
- `apps/api/src/modules/listening/README.md`
- `apps/admin/src/store.ts`
- `apps/admin/src/screens/radar.ts`
- `apps/admin/src/actions.ts` (filtros/acciones si cambian)
- `apps/api/scripts/check-listening.js`

### Según fase

- `apps/api/src/modules/content-engine/index.js` (Fase 5)
- `apps/api/src/lib/listening-cron.js` (solo si cambia contrato de detect)
- `apps/api/src/lib/firecrawl-client.js` / config (Fase 4)
- Seeds bajo `apps/api/src/db/seeds/`
- CSS admin si hay badges nuevos sin clase existente
- `preview-radar.html` (opcional, sandbox)
- `docs/ia/firecrawl-integracion.md` (si se documentan fuentes)

### No tocar (salvo sorpresa)

- `apps/web/` portal público
- distribution / publish paths
- auth core (roles actuales director/produccion bastan)

---

## 9. Plan de pruebas local

### Por fase

| Fase | Cómo probar |
|------|-------------|
| 1 | Migrar; seed o `UPDATE` manual; abrir admin RADAR; filtros y ficha |
| 2 | `POST /api/listening/topics/detect` con keys reales en `.env`; inspeccionar fila en `psql` y ficha |
| 3 | Casos con 1 vs 2 fuentes en markdown de prueba |
| 4 | Domain high/low y score resultante |
| 5 | Topic risk en DB → generate-proposal 409; force → ok |
| 6 | Query de distribución de statuses tras N detecciones |

### Automatizado

- Ampliar `check-listening.js`:
  - GET topics incluye nuevas columnas (o no 500).
  - Helper `normalizeVerification` con fixtures (unit en el mismo script o archivo pequeño sin framework).
  - Gate risk → 409 (Fase 5).
- No exigir happy-path de Perplexity en CI (misma política actual: sin gastar en APIs de pago).

### Manual editorial

- 5 temas reales de Perote: 2 solid, 1 viral dudoso, 1 rumor, 1 señal incompleta.
- Verificar que el lenguaje de la ficha ayuda a decidir sin abrir 10 tabs.

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| IA inventa URLs o “fuentes” | Prompt: no inventar URLs; `url` null si no está en input; cap verified en código |
| Falsos `risk` que matan agenda local | Guardar risk visible; no auto-borrar; force en generate; calibrar Fase 6 |
| Duplicar lógica INSERT web vs Facebook | Extraer `insertTopicRow` en topic-detection o helper shared |
| Confundir `status` vs verificación | Nombres distintos en API y UI; badges separados |
| Scope creep (tab Fuentes, TikTok, ML) | Fuera hasta Fase 4+; YAGNI |
| Dos UIs eternas (preview + admin) | Preview es referencia; promoción a admin es el éxito |

---

## 11. Key decisions

1. **`verification_status` separado de `status` workflow** — no reutilizar `Nuevo`/`Revisado` para calidad de fuente.
2. **Confianza ≠ menciones** — columnas distintas; el modelo no debe copiar mentions a confidence.
3. **Persistir risk, no solo descartar** — calibración y transparencia editorial.
4. **Cap de `verified` en código** — no confiar solo en el modelo.
5. **Gate content-engine estricto en `risk`** — alineado al patrón `force` de canibalización.
6. **Local-first, preview como brújula UX** — implementación en schema/API/admin TypeScript actual.
7. **Sin dependencias nuevas** — JSONB + smallint + prompts bastan.
8. **Gate editorial de publicación intacto** — este plan no autpublica ni bypasea aprobación humana.

---

## 12. Fuera de alcance (explícito)

- Auto-publicar por score alto.
- Productor real TikTok (solo seed hoy).
- Red social fact-checking de terceros.
- Reescritura completa del panel o del CSS del preview en producción.
- Sustituir Perplexity/Firecrawl por otro proveedor (salvo lo ya planificado en firecrawl doc).

---

## 13. Open questions (resolver al implementar si hace falta)

1. ¿Override manual de `verification_status` por el director en UI, o solo lo setea la detección?  
   **Default plan:** solo detección en PR1–2; override PATCH en PR opcional.
2. ¿`checking`/`signal` bloquean generate o solo advierten?  
   **Default plan:** solo `risk` bloquea; el resto advierte en UI.
3. ¿Backfill de topics viejos con un re-score batch?  
   **Default plan:** no; solo topics nuevos. UI “sin evaluar” para null.
4. ¿Newsletter debe excluir `risk`?  
   **Default plan:** sí filtrar en `newsletter-content.js` en la misma PR del gate o justo después (un WHERE extra).

---

## 14. Checklist de arranque (cuando se pida implementar)

- [x] Confirmar número de migración siguiente en `apps/api/src/db/migrations/` → `034_extend_topics_verification.sql`
- [x] PR1: migración + SELECT + types + UI null-safe + seed demo (2026-07-18)
- [x] PR2: prompts + normalize + INSERT unificado (web + FB)
- [x] PR3: gate generate-proposal + check
- [x] PR4: multi-fuente scrape + dedupe similarity + upgrade (2026-07-18)
- [x] PR5: lista de fuentes radar_sources + trust en detección + tab Fuentes (2026-07-18)
- [x] PR6 / Fase 6: radar-stats + UI calibración + docs/ia/radar-calibracion.md (2026-07-18)
- [ ] Probar en local con detect real + 1 ronda editorial de umbrales
- [ ] Archivar o anotar en `preview-radar.html` que el panel es fuente de verdad

---

## 15. Resumen de una línea

Extender `topics` con confianza y verificación al estilo `preview-radar.html`, rellenar esos campos en la detección con prompts + reglas, mostrarlos en el admin, y bloquear propuestas desde temas de alto riesgo — todo validado en local por fases, sin tocar el gate de publicación.
