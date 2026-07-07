# Generación de imágenes para ilustrar notas

Estado: **integrado** (2026-07-06). `generateImage()` en `ai-client.js`, endpoint
`POST /api/content/generate-image`, imágenes en tabla `generated_images` (migración 029)
servidas vía `GET /api/public/images/:id`, y UI en el editor de nota del admin
(botón "Generar imagen con IA" + prompt editable). Modelo configurable con `AI_MODEL_IMAGE`
(default `google/gemini-3-pro-image`).

## Decisión

Centralizar todo (texto + imagen) vía **OpenRouter** (`https://openrouter.ai/api/v1`, formato
chat/completions, mismo patrón que `chatComplete` en `apps/api/src/lib/ai-client.js`). Sin
dependencia nueva, solo cambia `base` y `model` del request.

Modelos elegidos (costo-beneficio):

- **`google/gemini-3-pro-image`** (Nano Banana Pro) — $0.134/img (1K-2K), sigue prompts
  complejos, texto legible en imagen. Usar para portadas / piezas destacadas.
- **`openai/gpt-image-1.5`** (Medium) — ~$0.04/img — default para ilustraciones normales,
  barato y calidad suficiente.

Descartado: Qwen-Image (barato pero output menos pulido para estilo editorial). Seedance no
aplica — es modelo de **video** (ByteDance/Doubao), no imagen; evaluar aparte si se quiere animar
contenido.

## Acceso verificado (2026-07-06)

- `OPENROUTER_API_KEY` en `apps/api/.env` (y placeholder en `.env.example`) — key con límite
  $10, confirmado con `GET /api/v1/key` → HTTP 200.
- Modelo `google/gemini-3-pro-image` disponible en catálogo y probado con generación real
  (`POST /api/v1/chat/completions`, `modalities: ["image","text"]`) → HTTP 200, imagen devuelta
  en `choices[0].message.images`.
- Hecho: `OPENROUTER_API_KEY` + `AI_MODEL_IMAGE` en `config/index.js` y `docker-compose.yml`;
  `generateImage()` en `ai-client.js` (mismo patrón de `chatComplete`). Probado end-to-end con
  generación real: PNG 1408x768 (~1.7MB) guardado en Postgres y servido con cache inmutable.

## Estimado de costos (asumiendo 1 imagen/nota, sin volumen real confirmado)

| Escenario | Notas/mes | GPT Image 1.5 Medium ($0.04) | Nano Banana Pro ($0.134) |
|---|---|---|---|
| Mes de pruebas | ~30 | ~$1.20 | ~$4 |
| Uso recurrente | ~300 | ~$12 | ~$40 |

Con mezcla (default GPT Image Medium, Nano Banana Pro solo destacadas) el costo real cae entre
ambos extremos — ajustar con volumen real cuando se tenga.

## ElevenLabs (TTS) — no centralizable en OpenRouter

ElevenLabs se queda fuera de OpenRouter (no ofrece TTS). Requiere plan pago propio, Free bloquea
la API con 402. Ya resuelto:

- Plan **Starter** ($5-6/mes) activado, habilita el endpoint.
- `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID` en `.env`, verificado con `POST
  /v1/text-to-speech/{voice_id}` → HTTP 200, audio MP3 generado.
- `apps/api/src/lib/elevenlabs-client.js` no necesita cambios, ya apuntaba bien.

## Presupuesto mes de pruebas (nivel Starter)

- ElevenLabs Starter: $5-6
- Imágenes (~30 notas, mezcla de modelos): ~$1-4
- **Total aprox: $10-11/mes**
