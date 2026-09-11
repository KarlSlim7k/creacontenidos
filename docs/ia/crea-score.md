# CREA Score — fórmula y pesos (RADAR 2.0, punto 12, R2-24)

> Mismo formato que [`radar-calibracion.md`](./radar-calibracion.md): perillas en código, tabla
> aquí como referencia. Complementa
> [`../implementaciones/radar2/04-crea-score.md`](../implementaciones/radar2/04-crea-score.md) (la
> spec de la fase) y [`../auditorias/RADAR-2.0-AUDITORIA.md`](../auditorias/RADAR-2.0-AUDITORIA.md) §9.

## El principio que no se negocia

**El score ordena, nunca decide.** Ningún tema desaparece de RADAR por score bajo — mismo
precedente que `risk` (se muestra igual, solo exige `force:true`). Un score alto puede *sugerir*
disparar un análisis nivel 3; nunca dispara redacción ni envío automáticos, sin importar qué tan
alto sea (ver `docs/ia/motor-editorial-crea.md` — la decisión de "todo bajo demanda" no cambia
aquí).

## Cómo se combinan los 8 factores

Cada factor produce un sub-score 0–100 **o queda ausente** (no se inventa, no se asume 0
silenciosamente). El score final es el **promedio ponderado de los factores presentes**, no de
los 8 fijos — así un tema con solo 3 factores calculables (ej. recién detectado, sin análisis
todavía) tiene un score comparable, basado en lo que sí se sabe, en vez de partir con desventaja
solo por no tener análisis todavía:

```
score = round( Σ(sub_score_i × peso_i) / Σ(peso_i) )   — solo sobre los factores i presentes
```

Si **ningún** factor está presente (no debería pasar: actualidad siempre tiene al menos
`detected_at`), el tema queda sin `crea_score` (`NULL`), nunca en 0 — 0 es un score real y bajo,
no "no hay dato".

## Los 8 factores

| # | Factor | Peso | Insumo | ¿Cuándo está ausente? |
|---|---|---|---|---|
| 1 | Relevancia local | 15 | `topics.territorial_scope` | Sin `territorial_scope` (temas sin ingesta externa, fase `02`) |
| 2 | Impacto potencial | 15 | `editorial_analyses.implicaciones` (nivel 3) | Sin análisis, o análisis nivel 1/2 (no llega a nivel 3) |
| 3 | Actualidad | 15 | `event_date` si existe, si no `detected_at` | **Nunca** — `detected_at` siempre existe |
| 4 | Número y calidad de fuentes | 15 | `topics.source_count` + `evidence[].reliable` | Solo si `source_count` es `NULL` (no debería pasar tras `normalizeVerification()`) |
| 5 | Interés ciudadano | **5** | `topics.mentions` | Nunca (default 0) — peso bajo a propósito, ver advertencia |
| 6 | Implicaciones prácticas | 15 | `editorial_analyses.para_el_ciudadano` (nivel 1+) | Sin ningún análisis todavía |
| 7 | Conversación detectada | 10 | `editorial_analyses.conversacion` | **Siempre**, hasta que `08-conversacion-digital.md` se resuelva — es `NULL` por diseño (regla no negociable de la fase `03`) |
| 8 | Originalidad del tratamiento | 10 | similarity(title) contra `content_proposals` publicadas | Solo si la consulta a DB falla (defensivo) |

Suma de pesos si los 8 estuvieran presentes: 100. Hoy, con el factor 7 permanentemente ausente y
el 1/2/6 dependientes de fases que recién se están cerrando, la mayoría de los temas puntúan sobre
un subconjunto — es el comportamiento esperado, no un bug.

### Advertencia documentada: factor 5 (interés ciudadano) y el sesgo a Facebook

`mentions` es interés estimado; en los posts de Facebook es engagement real, en los detectados vía
Firecrawl suele ser 0. Si este factor entrara con peso alto, reintroduciría la viralidad por la
puerta de atrás — exactamente lo que `confidence` explícitamente evita (`topic-verification.js`:
*"NO copiar viralidad/mentions"*). Por eso pesa **5**, el más bajo de los 8, con tope explícito en
el cálculo (`min(100, mentions × 2)`) — un tema con 50+ menciones ya satura el factor, no sigue
subiendo sin límite.

## Fórmula por factor (perillas en código, `lib/crea-score.js`)

| Factor | Cálculo | Perilla |
|---|---|---|
| Relevancia local | `local`→100, `regional`→70, `estatal`→40, `nacional`→20, `internacional`→5 | `TERRITORIAL_SCOPE_SCORE` |
| Impacto potencial | `min(100, nº implicaciones × 25)` | `IMPLICACIONES_UNIT` = 25 |
| Actualidad | `100 − díasTranscurridos × (100/14)`, piso 0 | `ACTUALIDAD_DECAY_DAYS` = 14 |
| Fuentes | `min(100, source_count × 25)` ± bonus por `reliable` (hasta ±15) | `SOURCE_COUNT_UNIT` = 25, `RELIABILITY_BONUS_CAP` = 15 |
| Interés ciudadano | `min(100, mentions × 2)` | `MENTIONS_UNIT` = 2 |
| Implicaciones prácticas | presencia de `para_el_ciudadano` (cualquier nivel) → 100; ausente → factor ausente | binario a propósito: es texto cualitativo, no hay una escala objetiva mejor sin sobre-ingenierizar |
| Conversación detectada | (sin implementar — placeholder para cuando exista `conversacion`) | — |
| Originalidad | `round((1 − maxSimilarityAPublicadas) × 100)` | reutiliza el mismo `similarity()` de canibalización (`content-engine/index.js`) |

Todas las perillas viven como constantes en `lib/crea-score.js`, mismo criterio que
`radar-calibracion.md` documenta para `topic-verification.js`/`topic-detection.js` — se ajustan
ahí, no acá.

## Bandas (panel, `R2-28`)

Igual que `confidenceBand()` ya existente en `radar.ts`:

| Banda | Rango | Uso |
|---|---|---|
| Alta | 80–100 | Candidato fuerte a análisis nivel 3 / boletín |
| Media | 60–79 | Requiere contexto antes de decidir |
| Baja | <60 | Permanece como señal — **nunca se oculta** |

## Cómo se sabe si está bien ponderado

Prueba manual obligatoria una vez haya datos reales (ver `01-feedback-editorial.md`, `radar-stats`
§`reasons`): correlacionar `crea_score` con `reason_code` de descarte. Si los temas de score alto
se descartan con la misma frecuencia que los de score bajo, el score está mal ponderado — es la
métrica más importante del MVP (`docs/auditorias/RADAR-2.0-AUDITORIA.md` §23.2). Ajustar **una**
perilla a la vez, mismo ritual que ya describe `radar-calibracion.md` §4.
