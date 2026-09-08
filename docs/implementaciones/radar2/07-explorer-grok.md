# Fase 7 — Explorer / Grok Bot (punto 10)

> Depende de: `02-api-senales-externas.md` (el contrato de señal debe existir antes de conectar
> cualquier proveedor) · Prioridad: **P1 / REQUIERE INVESTIGACIÓN antes de escribir código de
> producción** · Puede ir en paralelo con `06-multiformato.md`.

## La regla que no se negocia en esta fase

**RADAR no debe depender de Grok.** Si Grok se integra como una rama más dentro de
`detectAndSaveTopics()`, se replica el acoplamiento que ya existe con Firecrawl/Perplejidad y se
incumple el requisito más explícito del documento de encargo. **No escribas código de Grok dentro
del API.** El explorador, si se adopta, corre como proceso externo que solo consume
`POST /api/signals` (de la fase `02`) — exactamente como ya opera `apps/competitor-scraper/`.

## Qué existe hoy

- **Cero implementación.** `grep -ri "grok\|x\.ai\|xai"` sobre todo el repo solo devuelve
  documentación (`docs/ia/CREA_Stack_IA_Actualizado_v1.md:44`, marcado *"pendiente de evaluar"*).
- **El precedente arquitectónico más valioso ya existe:** `apps/competitor-scraper/` +
  `lib/competitor-scraper-client.js` — proveedor externo, fuera de proceso, contrato HTTP propio,
  timeout, `AbortSignal`, degradación a 503 si no está configurado. **Este es el molde a copiar**,
  no un ejemplo suelto.
- `GET /api/content/ai-usage` ya agrega tokens reales por acción — es la base para comparar costo
  por proveedor una vez haya más de uno.

## Especificación operativa disponible (del Documento Maestro v2, basada en documentación oficial
## de xAI — Overview, FAQ, Skills and routines, Terms, 2-3 sep 2026)

Esto **no resuelve** la investigación de viabilidad, pero sí fija restricciones de diseño que ya
deben incorporarse al documento de evaluación de `R2-40`:

- **CAPTCHA/login se resuelven con intervención humana, nunca se saltan.** Coincide con el límite
  ya vigente en `apps/competitor-scraper` (nunca hay bypass, solo detección de bloqueo).
- **Tres skills secuenciales**, empaquetadas en un bot único ("CREA Scout") para el MVP —no
  fragmentar responsabilidades en varios bots todavía:
  - **Skill A (escaneo):** recorre solo el catálogo activo de `09-catalogo-fuentes-salud.md`,
    detecta contenido nuevo desde el checkpoint, conserva URL/fecha/autor/resumen, marca fuente
    inaccesible sin fingir que fue revisada, no crea señal para "no pasó nada".
  - **Skill B (clustering/dedupe):** agrupa publicaciones del mismo acontecimiento sin borrar la
    diversidad de fuentes, distingue primaria/secundaria/social, marca discrepancias como
    "requiere verificación" sin resolverlas por inferencia.
  - **Skill C (pulso de conversación):** se activa solo con comentarios suficientes o relevancia
    editorial — ver `08-conversacion-digital.md`, esta skill **no** se implementa hasta que esa
    fase resuelva la adquisición.
- **Rutina diaria única**, 45-60 min antes del corte de "Buenos días, Perote" (06:30
  America/Mexico_City), con horario configurable desde RADAR.
- **Límites obligatorios** (van al perfil del bot, no son opcionales): no publicar/editar en
  WordPress/Meta, no eliminar información de RADAR, no cambiar configuración/fuentes sin
  aprobación, no saltar CAPTCHA, no asumir que una página no cambió si no pudo abrirla, no
  presentar inferencia como hecho, no guardar datos personales de comentaristas más allá de lo
  necesario para trazabilidad.
- **API key de solo ingestión** — coincide con el diseño de `signal_providers` de la fase `02`
  (`R2-11`): revocable, sin permiso de publicación ni administración.
- **Regla de confianza:** una señal de Grok entra siempre como `signal`/`checking`, nunca
  `verified` por venir de un proveedor de confianza declarada — ya está en el contrato de `R2-03`.

## Lo que la especificación del v2 sigue sin responder (por eso sigue siendo investigación)

Costo real por señal, cuota disponible, y si Grok Bot puede efectivamente leer conversación de
X/Twitter con los términos de uso vigentes para reuso editorial. Al momento de escribir este
documento, xAI **no publica un número fijo de "runs" o tareas por plan** — el consumo se mide por
*agent steps + tokens* contra un pool semanal compartido entre todos los productos de Grok
(Chat, Imagine, Voice, Bot), sin cap específico para Bot. Esto significa que la única forma
confiable de estimar cuántas corridas caben en una semana es **medir empíricamente** el consumo de
una corrida típica (una página, sin comentarios) contra el pool disponible en el plan contratado,
antes de comprometerse a la rutina diaria completa.

## Tareas

### R2-40 — Investigación de viabilidad de Grok/xAI

- **Módulo:** `docs`
- **Archivo:** `docs/ia/evaluacion-explorer-externo.md` *(nuevo)*
- **Debe responder, con datos, no con supuestos:**
  1. Acceso real a conversación de X/Twitter vía Grok Bot y términos de reuso editorial.
  2. **Costo por señal útil**, medido empíricamente (ver nota de cuota arriba) — no hay número
     público, hay que correr una prueba controlada y medir consumo real contra el pool del plan.
  3. Calidad en español regional: ¿encuentra algo sobre Perote que Firecrawl+Perplexity no
     encuentren? Medible con una prueba ciega de dos semanas comparando señales por proveedor —
     requiere el campo `provider` de la fase `02`.
  4. Modo de operación: Grok como bot que empuja a `POST /api/signals` (correcto, hace sustituible
     al proveedor) vs. como servicio que se consulta (reintroduce acoplamiento — descartar).
- **Debe incluir**, ya redactado, el timing de la rutina y las 3 skills de la sección anterior —
  no hace falta reinventarlos, solo trasladarlos al documento de evaluación.
- **Criterio de aceptación:** el documento cierra con una recomendación explícita: adoptar,
  aplazar o descartar.
- **Clasificación:** REQUIERE INVESTIGACIÓN. **No escribir R2-42 sin este documento cerrado.**

### R2-42 — Worker explorador (solo si `R2-40` recomienda adoptar)

- **Módulo:** fuera del API
- **Ubicación:** proceso propio, mismo espíritu que `apps/competitor-scraper/`
- **Hacer:** corre fuera del API y **solo** consume `POST /api/signals` con una API key de
  proveedor (`R2-11`). El API no debe tener ni una línea específica de Grok —
  `grep -ri grok apps/api/src` debe seguir sin resultados incluso después de adoptar el proveedor.
- **Criterio de aceptación:** el worker es sustituible por otro proveedor sin tocar el API.
- **Clasificación:** REQUIERE DESARROLLO — condicionado a `R2-40`.

### R2-43 — Precisión comparada por proveedor

- **Módulo:** `api/listening`
- **Archivo:** `modules/listening/index.js:478` (`radar-stats`)
- **Hacer:** reportar, por proveedor: señales aportadas, tasa de descarte, tasa de publicación,
  score medio.
- **Criterio de aceptación:** con dos o más proveedores activos (real o simulado de la fase `02`),
  el endpoint permite comparar su desempeño.
- **Clasificación:** REQUIERE DESARROLLO. Prioridad P2 — sin un segundo proveedor real, esta tarea
  no tiene nada que comparar todavía; puede posponerse hasta que `R2-42` esté en producción.

## Qué NO hacer

- No escribir ninguna línea de integración de Grok dentro de `apps/api/src` bajo ninguna
  circunstancia, adopte o no el proveedor.
- No prometer una cifra de "corridas por semana" antes de medir el consumo real — no existe un
  número público que lo permita calcular de antemano.
- No avanzar a `R2-42` sin que `R2-40` tenga una recomendación explícita por escrito.
- No dejar que el bot tenga permisos de publicación, borrado o administración en ningún momento,
  ni siquiera durante pruebas.

## Verificación

Esta fase no tiene "verificación de código" hasta que `R2-40` recomiende adoptar. Mientras tanto,
la verificación es la prueba de acceso descrita en la conversación de este proyecto: correr una
tarea puntual en Grok Bot contra 2-3 páginas del catálogo de `09-catalogo-fuentes-salud.md` y
confirmar si accede sin bloqueo, antes de construir nada.

Una vez exista `R2-42`:

```bash
cd apps/api
grep -ri grok src/   # debe devolver vacío
node scripts/run-checks.js unit
```

## Siguiente fase

Si se adopta, `R2-43` se puede añadir en cualquier momento después de `R2-42`. No bloquea ninguna
otra fase.
