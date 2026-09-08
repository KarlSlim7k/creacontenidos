# Fase 4 — CREA Score (punto 12)

> Depende de: `02-api-senales-externas.md` (localidad/fecha), `03-motor-editorial.md`
> (implicaciones/relevancia) · Habilita: `05-buenos-dias-perote.md` · Prioridad: **P0**

## El principio que no se negocia

**El score ordena, nunca decide.** Ningún tema desaparece de RADAR por score bajo — el precedente
correcto ya existe en el código: `risk` se muestra igual y solo exige `force:true`
(`content-engine/index.js:41-56`). El score alto puede *sugerir* nivel de análisis 3; nunca dispara
redacción ni envío automáticos.

## Qué existe hoy — insumos reales, no hay que inventar la mayoría

| Sistema | Mide | ¿Sirve de base al score? |
|---|---|---|
| `topics.confidence` (0-100) | Defensibilidad para publicar. El prompt es explícito: *"NO copiar viralidad/mentions"* (`topic-verification.js:373`) | **No** como score — mide otra cosa. Puede ser **un** factor, con cuidado |
| `topics.source_count` | Fuentes independientes por host, con piso estructural | Sí, directo — factor "cantidad de fuentes" |
| `radar_sources.trust` + `applyTrustFromSources()` | Calidad de dominio, pesos ya calibrados (`high +8/tope+16, medium +2/tope+6, low −12/tope−24`) | Sí, directo — factor "calidad de fuentes" |
| `topics.mentions` | Interés estimado; en Facebook es engagement real, en Firecrawl suele ser 0 | Parcial — sesgado a Facebook, ver advertencia abajo |
| `similarity()` de canibalización (`content-engine/index.js:59`) | Hoy es un portón binario (>0.35 → 409) | Sí, invertido — como gradiente es el factor "originalidad" |
| `isBetterTopic()` / `verificationRank()` (`topic-verification.js:271-290`) | Orden de calidad para el dedupe | Ya existe la noción de "cuál tema es mejor" — patrón a imitar |

**Prioridad efectiva hoy** (a reemplazar): `ORDER BY confidence DESC, mentions DESC` en
`lib/newsletter-content.js:50-51` — el boletín se ordena por defensibilidad y se desempata por
viralidad. Ninguna de las dos es valor editorial.

## Los 8 factores propuestos, y qué les falta

| Factor | Insumo | Bloqueado por |
|---|---|---|
| Relevancia local | No existe hoy | `topics.locality`/`territorial_scope` de la fase `02` |
| Impacto potencial | No existe | — (nuevo, vía `editorial_analyses.implicaciones`) |
| Actualidad | Parcial (`detected_at` sí, `event_date` no) | `topics.event_date` de la fase `02` |
| Número y calidad de fuentes | **Completo hoy** | — |
| Interés ciudadano | Parcial (`mentions`) | — |
| Implicaciones prácticas | No existe | `editorial_analyses` de la fase `03` |
| Conversación detectada | Solo el conteo | `08-conversacion-digital.md` (puede quedar en 0 hasta entonces) |
| Originalidad del tratamiento | Existe invertido | Leerlo como gradiente, no como portón |

## Tareas

### R2-24 — Fórmula y pesos documentados

- **Módulo:** `docs`
- **Archivo:** `docs/ia/crea-score.md` *(nuevo)*, mismo formato que `docs/ia/radar-calibracion.md`
- **Hacer:** los 8 factores con peso, origen del dato, y qué hacer si el dato falta (**no
  inventar el valor ausente ni asumir cero silenciosamente — declararlo ausente en el
  desglose**). Pesos provisionales están bien: se calibran después, como ya se hizo con
  `confidence`.
- **Advertencia a documentar explícitamente:** si `mentions` entra con peso alto, se amplifica el
  sesgo hacia Facebook (único origen con engagement real) y se reintroduce la viralidad por la
  puerta de atrás. Peso bajo, tope explícito, registrado en el desglose desde el día uno.
- **Criterio de aceptación:** el documento existe y las perillas están ubicadas en código, mismo
  formato que la tabla de knobs ya existente.
- **Clasificación:** REQUIERE DESARROLLO (decisión + documento).

### R2-25 — `lib/crea-score.js` — función pura

- **Módulo:** `api/lib`
- **Archivo:** `apps/api/src/lib/crea-score.js` *(nuevo)*
- **Hacer:** sin acceso a DB — recibe el tema + su análisis (si existe) y devuelve `{ score,
  breakdown }`. Testeable exactamente como `topic-verification.js`. **Factores ausentes no rompen
  ni inflan el resultado** — se excluyen del cálculo y se marcan como ausentes en `breakdown`.
- **Criterio de aceptación:** con datos parciales (ej. sin `editorial_analyses` todavía) el score
  se calcula solo con los factores disponibles, sin errores ni valores inventados.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-26 — Persistir score y recalcular al enriquecer

- **Módulo:** `api/db` + `lib`
- **Archivos:** `apps/api/src/db/migrations/0NN_crea_score.sql` *(nuevo)*, `lib/topic-detection.js:112`
- **Hacer:**
  ```sql
  ALTER TABLE topics ADD COLUMN IF NOT EXISTS crea_score SMALLINT CHECK (crea_score BETWEEN 0 AND 100);
  ALTER TABLE topics ADD COLUMN IF NOT EXISTS crea_score_breakdown JSONB;
  ```
  Llamar a `crea-score.js` desde `insertTopicIfNew()`, justo después de `normalizeVerification()`
  — mismo punto donde ya se resuelve trust y multi-fuente, corre para las tres (o más, tras la
  fase `02`) vías de ingesta sin duplicar código. Recalcular también cuando `_action ===
  'upgraded'` (el tema se enriquece con evidencia fusionada).
- **Criterio de aceptación:** todo tema nuevo o actualizado tiene score y desglose; el desglose no
  es opcional — sin él el score no es auditable ni discutible por el editor.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-27 — Exponer y ordenar por score

- **Módulo:** `api/listening`
- **Archivo:** `modules/listening/index.js:145` (SELECT), `:168` (`/topics/summary`)
- **Hacer:** `?order=score` disponible como opción explícita. **El orden por defecto sigue siendo
  cronológico** salvo elección explícita — no cambies el comportamiento actual sin que alguien lo
  pida. `summary` incluye bandas (80-100 / 60-79 / <60).
- **Criterio de aceptación:** ambos órdenes funcionan; nada rompe si se omite `?order`.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-28 — Panel: score con bandas y desglose

- **Módulo:** `admin`
- **Archivos:** `apps/admin/src/screens/radar.ts:16-28` (reutiliza el patrón de `confidenceBand`
  ya existente), `store.ts:203`
- **Hacer:** banda visible en la tabla (mismo lenguaje visual que ya usa la confianza), desglose
  completo en la ficha. **Ningún tema se oculta por score bajo** — verificar explícitamente que
  ningún filtro nuevo esconde temas, solo los reordena.
- **Criterio de aceptación:** el desglose es legible y auditable por un editor sin leer código.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-29 — Síntesis operativa del día

- **Módulo:** `api` + `admin`
- **Archivos:** `modules/listening/index.js:168` (`/topics/summary`), `screens/radar.ts`
- **Hacer:** RADAR abre con una línea tipo *"N señales desde el último corte · N descartadas · N
  señales · N contextualizar · N análisis CREA"*, con números reales (no simulados).
- **Criterio de aceptación:** los números coinciden con lo que hay en base de datos en ese
  momento.
- **Clasificación:** REQUIERE DESARROLLO. Prioridad P1 (mejora de experiencia, no bloquea el MVP).

## Qué NO hacer

- No dejar que el score dispare publicación, generación de propuesta, ni envío automáticos.
- No ocultar temas de score bajo — la banda es una etiqueta visual, no un filtro que borra.
- No calcular el score con datos inventados cuando falten `event_date`/`locality`/análisis — se
  declara el factor ausente, se recalcula cuando el dato aparezca.

## Verificación

```bash
cd apps/api
node scripts/run-checks.js unit
node scripts/check-listening.js
cd ../admin && npx tsc --noEmit
```

Prueba manual obligatoria: correlacionar `crea_score` con `reason_code` (de `01-feedback-editorial.md`)
una vez haya datos — si los temas de score alto se descartan igual que los de score bajo, el score
está mal ponderado. Es la métrica más importante del MVP (ver `docs/auditorias/RADAR-2.0-AUDITORIA.md`
§23.2).

## Siguiente fase

Con score y desglose persistidos, `05-buenos-dias-perote.md` puede usar "RADAR propone (top CREA
Score)" como paso de selección.
