# Motor Editorial CREA — niveles, disparo y campos (RADAR 2.0, punto 11)

> Decisión editorial de `R2-17` (bloqueaba `R2-18` en adelante), resuelta el 2026-09-11 con
> quien pilotea esta implementación. Complementa
> [`../implementaciones/radar2/03-motor-editorial.md`](../implementaciones/radar2/03-motor-editorial.md)
> (la spec de la fase) y [`../auditorias/RADAR-2.0-AUDITORIA.md`](../auditorias/RADAR-2.0-AUDITORIA.md) §8.

## El objeto maestro

`editorial_analyses` (migración `047`, `R2-18`) es el análisis que se interpone entre "el tema es
defendible" (verificación, ya existe) y "escribe la nota" (redacción). **Es el mismo objeto** que:

- El CREA Score (`04-crea-score.md`) lee para 3 de sus 8 factores.
- "PARA ENTENDER" en el boletín (`05-buenos-dias-perote.md`) — un análisis nivel 3 **es** esa sección.
- El multiformato (`06-multiformato.md`) usa como objeto editorial maestro del que derivan los renders.

No se construye tres veces. Un tema (`topics`) puede tener 0, 1 o varios análisis (FK, sin
`UNIQUE(topic_id)`) — el más reciente es el vigente.

## Los 8 campos + 1

Numerados como en la auditoría (§8.1), con su columna en `editorial_analyses`:

| # | Pregunta | Columna | Tipo |
|---|---|---|---|
| 1 | ¿Qué pasó? | `que_paso` | JSONB |
| 2 | ¿Por qué importa? | `por_que_importa` | TEXT |
| 3 | ¿Cuál es el contexto? | `contexto` | TEXT |
| 4 | ¿Qué dicen los datos? | `datos` | JSONB |
| 5 | ¿Qué implicaciones tiene? | `implicaciones` | JSONB |
| 6 | ¿Qué se está diciendo? | `conversacion` | JSONB |
| 7 | ¿Qué no sabemos? | `pendientes` | TEXT |
| 8 | ¿Qué necesita saber el ciudadano? | `para_el_ciudadano` | TEXT |
| — | Relevancia para Perote (nota corta, no es una de las 8) | `relevancia_perote` | TEXT |

**Campo 6 nunca se inventa.** Hasta que `08-conversacion-digital.md` resuelva su propia
investigación de adquisición, `conversacion` queda **NULL explícito** en los tres niveles — nunca
se rellena con `sentiment` o `mentions` disfrazados de análisis. El día que exista, lo llena
`R2-48`, no este servicio.

## Colisión de nombre (ya resuelta en el schema)

El nivel de profundidad se llama `analysis_level` (`1|2|3`), nunca "señal" — esa palabra ya la usa
`topics.verification_status = 'signal'` para un eje distinto (defensibilidad: *"interés local
incompleto, falta fecha/sede/cifra"*). Un tema puede estar en `verification_status: 'signal'` y
tener un `editorial_analyses` de `analysis_level: 3` a la vez; son ejes independientes.

## Los 3 niveles

| Nivel | Nombre | Campos que llena | Modelo (`ai-client.js` `MODELS`) |
|---|---|---|---|
| 1 | Señal | 1 (`que_paso`), 8 (`para_el_ciudadano`) | `default` |
| 2 | Contexto | 1, 2, 3, 8 (+ `relevancia_perote`) | `default` |
| 3 | Análisis CREA | 1, 2, 3, 4, 5, 7, 8 (+ `relevancia_perote`) — **6 queda NULL** | `complex` |

`relevancia_perote` se decide llenar desde el nivel 2 (va de la mano con "por qué importa" /
contexto), no reservarla solo para nivel 3 — es una nota corta, no encarece el nivel 2 de forma
relevante.

## Quién dispara cada nivel

**Decisión: los 3 niveles son siempre un clic humano explícito, vía `POST /topics/:id/analyze
{ level }`. Ninguno se dispara automáticamente — ni por cron, ni por un umbral del CREA Score, ni
al detectar un tema.**

Se evaluaron tres opciones (ver hilo de la sesión que resolvió esta decisión):

1. **Todo bajo demanda** (elegida) — nunca gasta en IA sin que alguien lo pida. Coincide
   exactamente con cómo ya funciona `generate-proposal` hoy (`content-engine/index.js`): un
   editor decide, la API nunca decide sola. Más simple de operar y de razonar.
2. Nivel 1 automático al detectar — se descartó: correría sobre **todo** tema detectado, incluidos
   los que se descartan a los cinco minutos (`risk`, ruido). Es gasto de IA sin gate editorial.
3. Niveles 1 y 2 automáticos si el tema pasa verificación (`checking`/`verified`) — se descartó
   por ahora: introduce una regla de disparo automático nueva justo cuando el resto del proyecto
   (`README.md` de `radar2/`, regla transversal 2: *"los crons gastan lo mínimo... analizar en
   profundidad... son siempre un click humano"*) va en la dirección contraria. Queda anotado como
   posible mejora futura **si** el volumen de temas verificados hace que "todo bajo demanda" se
   sienta lento en operación — no antes.

Esto simplifica `R2-20`: el endpoint no necesita lógica de disparo condicional ni engancharse a
ningún cron existente. La única regla dura que ya traía la spec de la fase (nivel 3 nunca desde
cron) se cumple trivialmente porque **ningún** nivel se dispara desde cron.

## Costo declarado por nivel (panel, `R2-21`)

Mismo patrón visual que la pestaña "Radar manual" (tarjeta con motor/rate-limit/costo estimado).
Los tres niveles comparten el rate limit de IA ya usado en otras rutas de este tipo
(`aiLimiter`-equivalente, 10 llamadas / 10 min por usuario — ver `radarAiLimiter` en
`modules/listening/index.js`).

| Nivel | Costo relativo | Por qué |
|---|---|---|
| 1 — Señal | Bajo | Modelo económico (`default`), 2 campos, prompt corto |
| 2 — Contexto | Bajo-medio | Mismo modelo, 4 campos + relevancia, prompt más largo |
| 3 — Análisis CREA | Alto | Modelo de razonamiento (`complex`), 7 campos, prompt más largo y exigente |

## Saneamiento de la salida

Mismo estándar que `normalizeVerification()`: topes de longitud por campo, descartar URLs
inventadas si algún campo trajera evidencia, y **una salida incompleta para el nivel pedido se
rechaza — no se persiste a medias**. El servicio (`lib/editorial-engine.js`, `R2-19`) separa la
construcción del prompt y el saneamiento (puros, testeables sin red) de la llamada real a
`chatComplete()`.
