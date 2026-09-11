# Contrato de señal externa — RADAR 2.0

> Documento accionable, autocontenido. Un proveedor externo (Grok Bot/CREA Scout, un
> tercero, o el proveedor simulado de pruebas `R2-41`) puede implementarse leyendo
> **solo este documento**, sin ver el código del proyecto.
>
> Tarea de origen: `R2-03` en
> [`docs/implementaciones/radar2/00-preparacion.md`](../implementaciones/radar2/00-preparacion.md).
> Diagnóstico completo: [`docs/auditorias/RADAR-2.0-AUDITORIA.md`](../auditorias/RADAR-2.0-AUDITORIA.md) §6, §25.3, §25.6.
>
> **Estado: el endpoint que recibe este payload (`POST /api/signals`) todavía no existe.**
> Esta fase (`00`) solo fija el formato. La API, la autenticación y las respuestas HTTP son
> `R2-10`…`R2-16` en [`02-api-senales-externas.md`](../implementaciones/radar2/02-api-senales-externas.md) — no
> las asumas todavía implementadas. Este documento es, mientras tanto, la única fuente de
> verdad del formato.

## Por qué existe

RADAR 2.0 quiere aceptar señales de más de un proveedor (Grok Bot, un scraper propio, un
tercero) sin acoplar el código a ninguno en particular. La forma de lograrlo es que **todos**
entreguen la misma forma de datos, definida aquí, y que el adaptador interno (`R2-13`,
`lib/signal-adapter.js`) sea el único punto que la traduce al modelo interno de `topics`.
Un proveedor nuevo debe poder integrarse sin tocar una línea de ese adaptador.

## Regla no negociable

**Una señal externa entra siempre como `checking` o `signal`, nunca como `verified`.**
Venir de un proveedor con API key válida es una señal de procedencia, no una verificación
editorial. Solo el proceso de verificación interno de CREA (o un editor humano) puede subir
un tema a `verified`. Un proveedor que mande `verificationStatus: "verified"` debe ser
degradado por el adaptador interno — esto se documenta aquí para que quede claro desde el
lado del proveedor: no sirve de nada mandarlo, el sistema lo va a bajar igual.

## Envolvente del payload

Cada señal es un objeto JSON con esta forma:

```jsonc
{
  "schemaVersion": "1.0",
  "provider": "string",
  "botRunId": "string | null",
  "sourceId": "string | null",
  "accessStatus": "ok | login_required | captcha | blocked | error",
  "signal": { /* los 17 campos del contrato original, ver tabla abajo */ },
  "conversationSnapshot": { /* opcional, ver sección propia */ }
}
```

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `schemaVersion` | string | **sí** | Versión de este contrato que el proveedor implementó. Hoy: `"1.0"`. Ver [Versionado](#versionado). |
| `provider` | string | **sí** | Identificador estable del proveedor (ej. `"grok-bot"`, `"fake-signal-provider"`). Es el mismo valor que se registra al dar de alta la API key (`R2-11`, `signal_providers`). |
| `botRunId` | string | no | Identificador de la corrida/sesión del bot que generó la señal, si el proveedor tiene ese concepto (ej. Grok Bot/CREA Scout). Sirve para trazabilidad y debugging, no participa en la lógica editorial. |
| `sourceId` | string | no | Referencia al catálogo de fuentes con salud (`docs/implementaciones/radar2/09-catalogo-fuentes-salud.md`) cuando el proveedor monitorea una fuente ya catalogada por CREA (ej. una cuenta de Facebook del catálogo semilla de Perote). `null` si la fuente no está en ese catálogo. |
| `accessStatus` | enum | **sí** | Estado de acceso del proveedor a la fuente en el momento de generar la señal: `ok`, `login_required`, `captcha`, `blocked`, `error`. Un valor distinto de `ok` no invalida la señal, pero baja su `confidence` esperada — ver [Validación](#validación-y-saneamiento). |
| `signal` | object | **sí** | Los 17 campos del contrato original. Ver tabla siguiente. |
| `conversationSnapshot` | object | no | Solo si el proveedor analizó conversación (comentarios, reacciones) sobre el hecho. Ver [su propia sección](#conversationsnapshot-opcional). Si el proveedor no hace este análisis, **omitir el campo por completo** (no mandar `null` ni un objeto vacío). |

## Los 17 campos de `signal`

Nombres en `camelCase`. Ningún campo obligatorio puede ir vacío o `null` — si el dato no
existe, dilo explícitamente en el campo de texto correspondiente (mismo criterio que ya usa
`VERIFICATION_JSON_SPEC` en el pipeline interno: preferible "fecha exacta no reportada por la
fuente" a inventar una fecha).

| # | Campo | Tipo | Oblig. | Descripción |
|---|---|---|---|---|
| 1 | `signalId` | string | **sí** | ID estable y único asignado por el proveedor a este hecho. Junto con `provider`, es la clave de idempotencia: reenviar el mismo `signalId` no debe crear una fila duplicada (lo resuelve `R2-12` con `(provider, external_id)` único). Si el proveedor no tiene un ID natural, generar uno determinista (ej. hash de título+fecha+fuente) — nunca un UUID aleatorio en cada reenvío del mismo hecho. |
| 2 | `title` | string, ≤ 500 car. | **sí** | Título del hecho, sin clickbait. Se trunca a 500 caracteres si es más largo. |
| 3 | `description` | string | no | Descripción breve (1-2 oraciones) del hecho, en lenguaje llano. |
| 4 | `detectedAt` | datetime ISO 8601 | **sí** | Cuándo el proveedor detectó/generó esta señal. Con zona horaria explícita (ej. `2026-09-10T14:30:00-06:00`) o UTC (`Z`). |
| 5 | `eventDate` | date ISO 8601 (`YYYY-MM-DD`) | no | Cuándo ocurrió el hecho en sí — puede ser distinto de `detectedAt` (ej. una señal detectada hoy sobre un hecho de hace tres días). `null` si la fuente no da fecha. |
| 6 | `locality` | string | no | Municipio o localidad (ej. `"Perote"`, `"Perote, Veracruz"`). `null` si no aplica o no se identifica. |
| 7 | `territorialScope` | enum | no | Uno de `local`, `regional`, `estatal`, `nacional`, `internacional`. Alcance del hecho, no de la fuente. |
| 8 | `category` | string | no | Categoría editorial libre (ej. `"seguridad"`, `"servicios_publicos"`, `"clima"`, `"politica"`, `"cultura"`, `"deportes"`). No hay enum cerrado todavía — se define en `R2-24` (CREA Score) si hace falta. |
| 9 | `source` | object `{ name, url }` | **sí** | Fuente primaria del hecho. `url` debe ser `http(s)://` válida o `null` — nunca una URL inventada. |
| 10 | `sourceType` | enum | **sí** | Uno de `primary`, `secondary`, `social`, `other` — mismo vocabulario que `evidence[].kind` en el pipeline interno (`docs/ia/radar-verificacion-plan.md`). |
| 11 | `factualSummary` | string | **sí** | Resumen **factual**, solo lo verificable — nada de opinión ni conjetura. Alimenta `known_facts` internamente. |
| 12 | `confidence` | integer 0–100 | **sí** | Qué tan defendible es el hecho para publicar (fuentes, corroboración, especificidad). **No** es popularidad ni viralidad — ese es un eje distinto que no existe en este contrato. |
| 13 | `corroboratingSources` | array de objetos | no | Fuentes adicionales que confirman o contradicen el hecho. Cada entrada: `{ label: string, url: string|null, kind: "primary"\|"secondary"\|"social"\|"other", supports: string|null, reliable: boolean|null }`. `reliable` es un booleano real (`true`/`false`), nunca una palabra suelta como `"moderately"`. Máximo 12 entradas — el resto se descarta. |
| 14 | `potentialRelevance` | string | no | Por qué le importaría esto a la audiencia de Perote/Veracruz. Insumo directo para el factor "relevancia local" del CREA Score (`R2-24`). |
| 15 | `commentsAvailable` | boolean | **sí** | Si el proveedor tiene acceso a comentarios/reacciones sobre este hecho que podría entregar como `conversationSnapshot` (en esta señal o en una posterior). |
| 16 | `mediaAvailable` | boolean | **sí** | Si hay foto, video o audio disponible asociado al hecho (el proveedor no manda el binario, solo indica que existe). |
| 17 | `verificationStatus` | enum | **sí** | Uno de `checking`, `signal` — **nunca `verified`, ver [Regla no negociable](#regla-no-negociable)**. `checking`: plausible pero falta corroboración o un dato clave. `signal`: interés local incompleto (falta fecha, sede, o cifra). Si el proveedor no puede distinguir, usar `signal`. |

## `conversationSnapshot` (opcional)

Solo presente si el proveedor analizó conversación digital (comentarios, respuestas,
reacciones) sobre el hecho. Es agregado — **nunca contiene identidad de personas** (ni
nombres, ni handles, ni URLs a perfiles individuales).

```jsonc
{
  "period": { "from": "2026-09-08T00:00:00Z", "to": "2026-09-10T23:59:59Z", "timezone": "America/Mexico_City" },
  "sourcesObserved": ["string", "..."],
  "sampleMethod": "string",
  "postsAnalyzed": 0,
  "commentsAnalyzed": 0,
  "themes": ["string", "..."],
  "recurringQuestions": ["string", "..."],
  "concerns": ["string", "..."],
  "supportFrames": ["string", "..."],
  "criticismFrames": ["string", "..."],
  "claimsToVerify": ["string", "..."],
  "amplificationSignals": ["string", "..."],
  "limitations": "string"
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `period` | object | Ventana de tiempo observada: `from`/`to` en ISO 8601, `timezone` como nombre IANA. |
| `sourcesObserved` | array de string | Qué páginas/cuentas se observaron (nombres, no URLs a perfiles personales). |
| `sampleMethod` | string | Cómo se armó la muestra (ej. "todos los comentarios públicos del post oficial en la ventana indicada"). **Obligatorio si el objeto está presente** — sin este campo, el análisis no es auditable. |
| `postsAnalyzed` | integer | Número de publicaciones consideradas. |
| `commentsAnalyzed` | integer | Número de comentarios considerados. |
| `themes` | array de string | Temas recurrentes detectados. |
| `recurringQuestions` | array de string | Preguntas que se repiten en la conversación. |
| `concerns` | array de string | Preocupaciones expresadas. |
| `supportFrames` | array de string | Maneras en que se enmarca el apoyo/acuerdo. |
| `criticismFrames` | array de string | Maneras en que se enmarca la crítica/desacuerdo. |
| `claimsToVerify` | array de string | Afirmaciones que circulan en la conversación y que un editor debería verificar antes de repetirlas. |
| `amplificationSignals` | array de string | Señales de que algo se está amplificando de forma no orgánica (opcional, dejar `[]` si no se detecta nada). |
| `limitations` | string | Limitaciones del análisis (tamaño de muestra, sesgo de la fuente, ventana corta, etc.). **Obligatorio** — ningún `conversationSnapshot` se muestra en el panel sin su nota metodológica (`R2-49`). |

## Validación y saneamiento

Reglas que aplicará el endpoint cuando exista (`R2-12`), documentadas aquí para que un
proveedor pueda autovalidarse antes de mandar nada:

- `schemaVersion`, `provider`, `accessStatus` y los campos marcados **sí** en la tabla de 17
  son obligatorios. Falta uno → la señal se rechaza (400), no se descarta silenciosamente.
- `confidence` se recorta a `[0, 100]`; valores fuera de rango o no numéricos se tratan como
  inválidos, no se clampean en silencio.
- `title` se trunca a 500 caracteres. `corroboratingSources` se trunca a 12 entradas.
- Cualquier `url` (en `source` o en `corroboratingSources`) que no empiece con `http://` o
  `https://` se descarta (se guarda como `null`) — nunca se inventa ni se completa.
- `verificationStatus: "verified"` en la entrada se reescribe a `checking` o `signal` según
  `confidence` (regla no negociable, arriba). No es un error del proveedor, es comportamiento
  esperado — no lo interpretes como un bug del endpoint.
- `accessStatus` distinto de `ok` (`login_required`, `captcha`, `blocked`, `error`) no
  rechaza la señal, pero el adaptador interno la trata como evidencia débil: no cuenta como
  fuente confiable adicional aunque `confidence` venga alto. Un proveedor que reporta bloqueos
  con confidence 95 de forma sistemática es una señal de que su scraping está fallando, no de
  que el hecho es sólido.
- `(provider, signalId)` es la clave de idempotencia. Reenviar la misma combinación con datos
  actualizados **mejora** la fila existente (mismo criterio que `isBetterTopic()` ya aplica
  internamente); no crea una fila nueva.

## Ejemplo completo

```json
{
  "schemaVersion": "1.0",
  "provider": "fake-signal-provider",
  "botRunId": "run-2026-09-10-0800",
  "sourceId": "perote-noticias-fb",
  "accessStatus": "ok",
  "signal": {
    "signalId": "fake-2026-09-10-corte-agua-001",
    "title": "CMAS confirma corte de agua en cuatro colonias de Perote",
    "description": "Mantenimiento programado a la red de distribución en la zona centro.",
    "detectedAt": "2026-09-10T08:15:00-06:00",
    "eventDate": "2026-09-10",
    "locality": "Perote",
    "territorialScope": "local",
    "category": "servicios_publicos",
    "source": { "name": "CMAS Perote — comunicado oficial", "url": "https://cmas-perote.example.mx/comunicados/2026-09-10" },
    "sourceType": "primary",
    "factualSummary": "CMAS publicó un comunicado confirmando corte de agua en cuatro colonias por mantenimiento a la red, con restablecimiento estimado antes de las 20:00.",
    "confidence": 82,
    "corroboratingSources": [
      { "label": "Ayuntamiento de Perote — Facebook oficial", "url": "https://facebook.com/AyuntamientoPerote/posts/xxxx", "kind": "primary", "supports": "Comparte el mismo comunicado", "reliable": true }
    ],
    "potentialRelevance": "Afecta directamente a vecinos de cuatro colonias; recurrente en la temporada.",
    "commentsAvailable": true,
    "mediaAvailable": false,
    "verificationStatus": "checking"
  },
  "conversationSnapshot": {
    "period": { "from": "2026-09-10T08:00:00-06:00", "to": "2026-09-10T12:00:00-06:00", "timezone": "America/Mexico_City" },
    "sourcesObserved": ["Facebook oficial de CMAS Perote", "Facebook oficial del Ayuntamiento de Perote"],
    "sampleMethod": "Todos los comentarios públicos del post oficial de CMAS en la ventana indicada",
    "postsAnalyzed": 2,
    "commentsAnalyzed": 47,
    "themes": ["horario de restablecimiento", "colonias afectadas"],
    "recurringQuestions": ["¿Hasta qué hora va a durar el corte?"],
    "concerns": ["Negocios que dependen del agua durante el día"],
    "supportFrames": ["Agradecen que avisaran con anticipación"],
    "criticismFrames": ["Reclaman que ya es la segunda vez este mes"],
    "claimsToVerify": ["Un comentario afirma que también afecta a una quinta colonia no mencionada en el comunicado"],
    "amplificationSignals": [],
    "limitations": "Muestra limitada a comentarios públicos de dos páginas oficiales; no incluye grupos vecinales privados."
  }
}
```

Señal mínima válida, sin conversación (la mayoría de los proveedores mandarán esto):

```json
{
  "schemaVersion": "1.0",
  "provider": "fake-signal-provider",
  "botRunId": null,
  "sourceId": null,
  "accessStatus": "ok",
  "signal": {
    "signalId": "fake-2026-09-10-002",
    "title": "Feria del libro anuncia sede en Perote para octubre",
    "description": null,
    "detectedAt": "2026-09-10T09:00:00-06:00",
    "eventDate": null,
    "locality": "Perote",
    "territorialScope": "local",
    "category": "cultura",
    "source": { "name": "Página de Facebook del organizador", "url": "https://facebook.com/FeriaLibroPerote/posts/yyyy" },
    "sourceType": "social",
    "factualSummary": "Una publicación anuncia una feria del libro en Perote en octubre; no hay fecha exacta ni confirmación de sede.",
    "confidence": 35,
    "corroboratingSources": [],
    "potentialRelevance": "Evento cultural local, relevante para agenda de eventos.",
    "commentsAvailable": false,
    "mediaAvailable": true,
    "verificationStatus": "signal"
  }
}
```

## Versionado

- `schemaVersion` sigue `MAJOR.MINOR` (ej. `"1.0"`, `"1.1"`).
- Un `MINOR` nuevo solo agrega campos opcionales — nunca cambia el significado de uno
  existente ni lo vuelve obligatorio. Un proveedor en `"1.0"` sigue siendo válido cuando el
  contrato sube a `"1.1"`.
- Un `MAJOR` nuevo puede romper compatibilidad (renombrar, quitar, o volver obligatorio un
  campo). Cuando eso pase, el endpoint (`R2-12`, cuando exista) debe aceptar ambas versiones
  en paralelo durante una ventana de transición documentada en ese momento — no se rompe a un
  proveedor existente sin aviso.
- Cambios a este contrato (los del v2 del documento maestro: `provider`, `botRunId`,
  `sourceId`, `accessStatus`, `conversationSnapshot`) ya están incorporados en `"1.0"` — no
  hubo una versión previa sin ellos en producción, así que no cuentan como ruptura.

## Para quien implemente el adaptador interno (`R2-13`)

Esta sección es la única que asume conocimiento del código — un proveedor externo no la
necesita.

| Campo de `signal` | Destino interno | Nota |
|---|---|---|
| `signalId` + `provider` | `topics.provider`, `topics.external_id` (únicos parciales, `R2-10`) | Clave de idempotencia/upgrade, paralela a la que ya usa `findRecentSimilarTopic()` por título+similarity. |
| `title` | `topics.title` | Mismo tope de 500 car. que ya aplica `normalizeVerification()`. |
| `factualSummary` | `topics.known_facts` | |
| `eventDate`, `locality`, `territorialScope`, `category` | `topics.event_date`, `topics.locality`, `topics.territorial_scope`, `topics.category` (columnas nuevas, `R2-10`) | No existen hoy en `topics`; los usa el CREA Score (`R2-24`) para relevancia local y actualidad. |
| `source` + `corroboratingSources` | `topics.evidence[]` | Mapear `source` como primer elemento (`kind` = `sourceType`) y anexar `corroboratingSources` — misma forma que ya produce `normalizeEvidence()`, por diseño. |
| `confidence` | `topics.confidence` | Pasa por `applyTrustFromSources()` igual que cualquier otra fuente si el dominio está en `radar_sources`. |
| `verificationStatus` | `topics.verification_status` | Reescribir `verified`→`checking`/`signal` **antes** de llamar a `normalizeVerification()`, no confiar en que el cap interno lo agarre siempre (el cap depende de `source_count`/`hasPrimary`, que una señal externa con una sola fuente primaria sí podría cumplir). |
| `commentsAvailable`, `mediaAvailable` | sin columna dedicada todavía | Insumo para Multiformato (`R2-36`) y Conversación Digital (`R2-44`). |
| `accessStatus` | `activity_log.metadata.access_status` | No se persiste en `topics`; es señal operativa (salud del proveedor), no editorial. Ver también `R2-52`…`R2-55` (salud de fuentes). |
| `conversationSnapshot` | campo 6 del Motor Editorial (`R2-19`, "¿qué se está diciendo?") | Nunca se genera dentro de `lib/topic-detection.js` — es responsabilidad exclusiva del punto 13 (`R2-44`…`R2-49`), condicionado a su propia investigación de adquisición y política de datos. |
