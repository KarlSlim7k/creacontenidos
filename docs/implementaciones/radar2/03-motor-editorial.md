# Fase 3 — Motor Editorial CREA (punto 11)

> Depende de: `00-preparacion.md` · Habilita: `04-crea-score.md`, `05-buenos-dias-perote.md`
> (sección "PARA ENTENDER"), `06-multiformato.md` (objeto maestro) · Prioridad: **P0**
> Puede ir en paralelo con `02-api-senales-externas.md`: corre sobre los temas que RADAR ya
> detecta hoy, no necesita esperar a la ingesta externa.

## Por qué es la fase con más apalancamiento de todo RADAR 2.0

Hoy una señal verificada salta directo a "escribir la nota" — no hay nada entre "es defendible" y
"redáctalo". Esta fase construye ese objeto intermedio, y **es el mismo objeto** que:

- El CREA Score necesita para calcular 3 de sus 8 factores (implicaciones, relevancia, conversación).
- "PARA ENTENDER" en el boletín necesita para existir (es un análisis nivel 3).
- El multiformato necesita como objeto editorial maestro del que derivan los renders.

**No construyas estas tres cosas como entidades separadas.** `editorial_analyses` de esta fase es
el objeto maestro del punto 15 — construirlo dos veces es la peor deuda técnica que este proyecto
podría adquirir en esta etapa.

## Qué existe hoy

| # | Pregunta del Motor Editorial | ¿Existe? | Dónde |
|---|---|---|---|
| 1 | ¿Qué pasó? | Parcial | `topics.known_facts` + `topics.actores`, prosa de 2-4 oraciones |
| 2 | ¿Por qué importa? | No | — |
| 3 | ¿Cuál es el contexto? | Sí, parcial | `topics.antecedentes` |
| 4 | ¿Qué dicen los datos? | No | — |
| 5 | ¿Qué implicaciones tiene? | No | `topics.angulos` es enfoque de cobertura, no implicación |
| 6 | ¿Qué se está diciendo? | No | depende de `08-conversacion-digital.md` |
| 7 | ¿Qué no sabemos? | Sí | `topics.unknown_facts` |
| 8 | ¿Qué necesita saber el ciudadano? | No | — |

Todo lo que existe se genera **dentro del mismo prompt de detección** (`ai-client.js:246, 266,
305`), junto con la ficha de verificación. Es lo contrario al esquema por niveles que se pide
aquí: hoy se analiza una sola vez, con el modelo barato, antes de saber si el tema merece
profundidad.

**Colisión de nombre a resolver antes de escribir código:** `topics.verification_status` ya tiene
un valor `signal` que significa *"interés local incompleto, falta fecha/sede/cifra"*
(`topic-verification.js:378`) — es un eje de **defensibilidad**. El nivel de profundidad de esta
fase es un eje distinto: **¿cuánta profundidad merece?** Nómbralo `analysis_level` (1|2|3) y no
reutilices la palabra "señal" para él.

## Qué reutilizar tal cual

- `chatComplete()` (`ai-client.js:115`) — cadena de fallback cross-provider ya resuelta.
- `parseJson()` (`ai-client.js:182`) — extracción y reparación de JSON de modelos débiles.
- `VERIFICATION_JSON_SPEC` (`topic-verification.js:370`) — modelo de cómo este proyecto especifica
  un contrato de salida a un LLM. Sigue el mismo patrón para el output del análisis.
- `directiveBlock()` (`ai-client.js:177`) + `editorial_settings` — la directriz editorial ya se
  antepone al prompt; aplícala igual aquí.
- `logActivity()` + `activity_log.metadata` — trazabilidad de modelo/proveedor/tokens sin tabla
  nueva.

## Tareas

### R2-17 — Decidir y documentar los 3 niveles y su disparador

- **Módulo:** `docs`
- **Archivo:** `docs/ia/motor-editorial-crea.md` *(nuevo)*
- **Hacer:** definir, por escrito, qué campos llena cada nivel y quién lo dispara:
  - **Nivel 1 — Señal:** hecho breve. Llena campos 1 y 8.
  - **Nivel 2 — Contexto:** + antecedentes/explicación. Llena campos 1, 2, 3, 8.
  - **Nivel 3 — Análisis CREA:** los 8 campos completos.
  Resolver explícitamente: ¿el nivel lo decide una regla fija, el CREA Score sobre un umbral, o
  siempre una persona? (Pregunta abierta del documento original — esta decisión **bloquea** el
  resto de la fase.)
- **Criterio de aceptación:** el documento existe y responde la pregunta anterior sin ambigüedad.
- **Clasificación:** REQUIERE INVESTIGACIÓN (decisión editorial, no técnica) — resuélvela con
  quien tenga criterio editorial antes de escribir `R2-18` en adelante.

### R2-18 — Tabla `editorial_analyses` (= objeto editorial maestro)

- **Módulo:** `api/db`
- **Archivo:** `apps/api/src/db/migrations/0NN_editorial_analyses.sql` *(nuevo)*
- **Hacer:**
  ```sql
  CREATE TABLE IF NOT EXISTS editorial_analyses (
    id SERIAL PRIMARY KEY,
    topic_id INTEGER NOT NULL REFERENCES topics(id),
    analysis_level SMALLINT NOT NULL CHECK (analysis_level IN (1,2,3)),
    que_paso JSONB,
    por_que_importa TEXT,
    contexto TEXT,
    datos JSONB,
    implicaciones JSONB,
    conversacion JSONB,
    pendientes TEXT,
    relevancia_perote TEXT,
    para_el_ciudadano TEXT,
    model TEXT,
    provider TEXT,
    tokens_used INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_editorial_analyses_topic ON editorial_analyses (topic_id);
  ```
  Nota: FK a `topics`, **no** `ALTER TABLE topics`. Permite varias versiones por tema (no hay
  `UNIQUE(topic_id)`) — la más reciente es la vigente.
- **Criterio de aceptación:** los 8 campos + `analysis_level` + trazabilidad de modelo/tokens
  existen; un tema puede tener 0, 1 o varios análisis.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-19 — Servicio del Motor Editorial

- **Módulo:** `api/lib`
- **Archivo:** `apps/api/src/lib/editorial-engine.js` *(nuevo)*
- **Hacer:** un prompt por nivel (no un prompt monolítico con los 8 campos siempre). Salida
  validada y saneada con la misma disciplina que `normalizeVerification()` (topes de longitud,
  descarte de URLs inventadas). Registrar proveedor, modelo y tokens en `activity_log` vía
  `logActivity()`.
- **Función pura primero:** separa la construcción del prompt y el saneamiento de la salida
  (testeables sin red) de la llamada real a `chatComplete()`.
- **Criterio de aceptación:** llamar al servicio con nivel 1/2/3 produce solo los campos de ese
  nivel; una salida incompleta del modelo se rechaza, no se persiste a medias.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-20 — Endpoints de análisis

- **Módulo:** `api/listening` o `api/editorial`
- **Archivo:** `apps/api/src/modules/listening/index.js` o `modules/editorial/index.js`
- **Hacer:** `POST /api/topics/:id/analyze { level }` (rate-limited igual que `aiLimiter` ya usado
  en otras rutas de IA), `GET /api/topics/:id/analysis`.
- **Regla dura:** el nivel 3 **nunca** se dispara desde un cron — mismo criterio que ya rige
  `generate-proposal` (comentario `ponytail:` en `lib/listening-cron.js:1-8`: *"generar propuesta
  de contenido sigue siendo un click humano"*).
- **Criterio de aceptación:** análisis por nivel disponible vía API; nivel 3 solo responde a
  petición explícita (humano o, si `R2-17` lo decide así, score sobre umbral — nunca cron).
- **Clasificación:** REQUIERE DESARROLLO.

### R2-21 — Panel: ficha de análisis editorial

- **Módulo:** `admin`
- **Archivos:** `apps/admin/src/screens/radar.ts` (drawer), `store.ts`, `actions.ts`
- **Hacer:** los 8 campos visibles y **distinguibles de la ficha de verificación** (son dos objetos
  distintos: verificación = "es defendible", análisis = "qué significa"). Botón por nivel con el
  costo declarado, mismo patrón visual que ya usa la pestaña Radar manual.
- **Criterio de aceptación:** un editor puede ver ambas fichas sin confundirlas; disparar un nivel
  muestra su costo antes de confirmarlo.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-22 — `generate-proposal` lee del análisis, no del tema crudo

- **Módulo:** `api/content-engine`
- **Archivos:** `modules/content-engine/index.js:32-129`, `lib/ai-client.js:328`
- **Hacer:** si el tema tiene un análisis, `generateProposal()` se alimenta de él. **Si no tiene
  análisis, el comportamiento actual se conserva sin cambios** — esto es lo que convierte la
  redacción en *renderizado* sin romper nada existente. Los gates de riesgo y canibalización
  (`content-engine/index.js:41-70`) siguen intactos y se evalúan igual.
- **Criterio de aceptación:** una propuesta generada desde un análisis nivel 3 incluye contexto e
  implicaciones que hoy no aparecen; una propuesta sobre un tema sin análisis se ve idéntica a hoy.
- **Clasificación:** REQUIERE DESARROLLO. Prioridad P1 (no bloquea el MVP mínimo, pero sí
  `06-multiformato.md`).

### R2-23 — Checks del Motor Editorial

- **Módulo:** `api/tests`
- **Archivo:** `apps/api/scripts/check-editorial-engine.js` *(nuevo)*
- **Hacer:** camino feliz por nivel usando el stub de `fetch` de `00-preparacion.md` (`R2-02`);
  validar que una salida incompleta del modelo se rechaza.
- **Criterio de aceptación:** corre en CI sin gastar en APIs de pago.
- **Clasificación:** REQUIERE DESARROLLO.

## Qué NO hacer

- No agregar los 8 campos como columnas de `topics`. Van en `editorial_analyses`.
- No usar la palabra "señal" para el nivel de profundidad — ya significa otra cosa en
  `verification_status`.
- No disparar nivel 3 automáticamente desde ningún cron, sin importar qué tan alto sea el
  CREA Score (fase `04`) una vez exista.
- No construir el campo 6 ("¿qué se está diciendo?") con datos inventados. Si
  `08-conversacion-digital.md` no está resuelto todavía, el campo queda **explícitamente vacío**,
  no se rellena con `sentiment` ni con `mentions` disfrazado de análisis.

## Verificación

```bash
cd apps/api
node scripts/run-checks.js unit
node scripts/check-editorial-engine.js
cd ../admin && npx tsc --noEmit
```

## Siguiente fase

Con `editorial_analyses` y el servicio funcionando, `04-crea-score.md` puede leer sus campos, y
`05-buenos-dias-perote.md` puede usar un análisis nivel 3 como "PARA ENTENDER".
