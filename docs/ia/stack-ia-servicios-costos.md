# Stack de servicios IA — estructura, pruebas y costos hacia producción

Estado: vigente al 2026-07-06. Complementa [[generacion-imagenes.md]] (detalle imagen)
y [[politica-ia-y-gate-editorial.md]] (reglas editoriales). Volúmenes marcados como
"asumido" — no hay dato confirmado de posteos/mes reales, ajustar cuando se tenga.

## Estructura actual (por capa, `apps/api/src/lib/`)

| Capa | Servicio | Uso | Config |
|---|---|---|---|
| Texto (RADAR búsqueda) | Perplexity Sonar Pro | `detectTopics`, `detectCompetitorPosts` — única fuente con acceso web real | `PERPLEXITY_API_KEY` |
| Texto (propuestas/borradores/QA/newsletter) | Nous Portal (Hermes vía suscripción) | `generateProposal`, `generateDraft`, `qaCheck`, `generateNewsletterEditorial` | `NOUS_PORTAL_API_KEY` + `AI_MODEL_DEFAULT/COMPLEX/QA` |
| Imagen | OpenRouter → `google/gemini-3-pro-image` (Nano Banana Pro) y `openai/gpt-image-1.5` | Ilustrar notas (pendiente integrar función en `ai-client.js`) | `OPENROUTER_API_KEY` (ya en `.env`, acceso verificado) |
| Audio (TTS) | ElevenLabs (plan Starter) | `synthesizeSpeech` — voz para `guion_audio` | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` |
| Video | — (sin integrar) | — | — |

Keys con placeholder sin activar (`.env.example`): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` directo
(no vía OpenRouter), `APIFY_API_TOKEN` (social listening, fase posterior).

## Qué se tiene ya para pruebas

- Nous Portal: suscripción activa, cubre texto (propuestas, borradores, QA, newsletter).
- Perplexity: key activa, cubre búsqueda real (RADAR + competencia).
- OpenRouter: key activa, $10 de saldo, acceso confirmado a modelos de imagen.
- ElevenLabs: plan Starter activo, TTS confirmado funcionando (HTTP 200 en prueba real).

Con esto ya se puede probar el pipeline completo (texto → imagen → audio) sin nada adicional.

## Cercano a futuro (no integrado, evaluar si crece el volumen)

- **Video**: Seedance (ByteDance/Doubao) u otro modelo de video vía OpenRouter — para animar
  piezas destacadas o clips de redes. No cotizado aún, evaluar cuando haya necesidad real de video.
- **Anthropic/OpenAI directo**: si Nous Portal no alcanza en calidad para piezas complejas
  (guiones largos), ya hay placeholders de key — activar sería solo cambiar `modelKey` en
  `ai-client.js`, sin cambio de arquitectura porque ya centralizamos en formato chat/completions.
- **Apify** (`APIFY_API_TOKEN`): social listening automatizado, ya contemplado en `.env` para
  fase posterior a RADAR manual/Perplexity.

## Costos aproximados

Dos escenarios: **mes de pruebas** (validar pipeline, bajo volumen) y **mes recurrente en
público** (operación normal). Cifras de imagen y TTS ya validadas con pricing real; texto
(Nous/Perplexity) es costo fijo de suscripción, no varía con volumen dentro de cuota razonable.

### Mes de pruebas (~30 notas)

| Servicio | Supuesto | Costo |
|---|---|---|
| Nous Portal | suscripción ya pagada | $0 adicional |
| Perplexity Sonar Pro | ~30 búsquedas (RADAR + competencia) | ~$1-2 |
| Imágenes (OpenRouter, mezcla GPT Image Medium / Nano Banana Pro) | 1 img/nota | ~$1-4 |
| ElevenLabs Starter | plan base, ~20% notas con audio (6 piezas x 3 min ≈ 18 min ≈ 2,700 caracteres) | $5-6 (incluido en plan, no rebasa 30k créditos) |
| **Total** | | **≈ $10-11/mes** |

### Mes recurrente en público (~300 notas/mes, asumido)

| Servicio | Supuesto | Costo |
|---|---|---|
| Nous Portal | misma suscripción | $0 adicional (validar límite de uso si volumen sube fuerte) |
| Perplexity Sonar Pro | ~300 búsquedas/mes | ~$10-15 |
| Imágenes (mezcla, 1/nota) | 300 imgs | ~$12 (default GPT Image Medium) a $40 (si todas Nano Banana Pro) |
| ElevenLabs | ~20% notas con audio = 60 piezas x 3 min ≈ 180 min ≈ 27,000 caracteres/mes | Starter alcanza ($5-6); si sube a ~40% (120 piezas ≈ 360 min ≈ 54,000 caracteres) pasa a plan **Creator $18-22/mes** (121,000 créditos) |
| **Total (caso base, Starter, mezcla barata de imagen)** | | **≈ $27-33/mes** |
| **Total (caso alto, Creator, más Nano Banana Pro)** | | **≈ $65-75/mes** |

Escalón siguiente si volumen de audio crece mucho más (ej. audio en todas las notas): revisar
plan **Pro ElevenLabs ($99/mes, 600k créditos ≈ 4,000 min)** — no se necesita todavía con los
supuestos actuales.

## Cómo actualizar este documento

Reemplazar los "asumido" por datos reales apenas se tenga: notas/mes publicadas, % con versión
audio, duración promedio real de guion_audio. El resto de la tabla (precio por unidad) ya está
confirmado con pricing vigente al 2026-07-06.
