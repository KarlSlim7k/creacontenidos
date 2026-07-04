# Runbook: incidentes y fallbacks de IA

> Recortado de `crea_web/docs/runbooks/incidents-and-fallbacks.md` (v1). Se quitaron los
> escenarios que no aplican a un monolito Express sin broker de eventos ni orquestador
> dedicado (cola de eventos creciendo, Mac mini/OpenClaw offline) — no existen en v2. Quedan
> los tres escenarios que sí van a pasar aquí: falla de proveedor IA, falla de publicación,
> y riesgo legal/editorial detectado.

## 1. Caída de proveedor de IA (Claude / Perplexity / lo que determine la política de ruteo)

**Síntoma**: timeout o error 5xx en las llamadas de `content-engine` o `listening`.

**Acciones**:
1. `listening`: si Perplexity falla, seguir con la fuente RSS (Google News) como fallback — ver [`especificacion-pipeline.md`](./especificacion-pipeline.md) §`listening`. El tema simplemente se detecta con menos contexto ese ciclo, no se pierde.
2. `content-engine`: si la llamada al modelo falla para un tema, dejar el `topic` en `status='new'` para reintentar en el siguiente ciclo (ver spec de la capa). No hay fallback automático a un segundo proveedor todavía — es una mejora futura si se decide correr Hermes/Nous Portal (ver `politica-ia-y-gate-editorial.md` §1.2), que sí soporta cadenas de fallback nativas.
3. Si la caída persiste varios ciclos, notificar al equipo editorial manualmente (no hay canal automático como el Telegram de v1) — por ahora, revisar logs del proceso API.

**Condición de salida**: el proveedor se restablece y el siguiente ciclo de cron procesa los temas pendientes con normalidad (no hace falta reprocesar nada manualmente, el diseño ya es "recoger lo que sigue en `status='new'`").

## 2. Error en publicación (`distribution`)

**Síntoma**: `content_proposals.status='published'` pero no existe la fila correspondiente en `published_content` para esa plataforma.

**Acciones**:
1. Reintentar en el siguiente ciclo del cron de `distribution` (`every 5m`) — el query de la capa ya solo toma lo que le falta `published_content`, así que el reintento es automático, no hace falta idempotency key aparte.
2. Si falla repetidamente (definir un umbral, p. ej. 3 ciclos ≈ 15 min), permitir publicación manual de contingencia (postear directo en Facebook y registrar la fila en `published_content` a mano) — no construir una DLQ para este volumen.

**Condición de salida**: existe la fila en `published_content` con `url` válida.

## 3. Contenido sensible detectado

**Síntoma**: una propuesta con `sensibilidad` alta (acusaciones directas, seguridad pública, salud, menores, contenido político en periodo electoral) llega al gate editorial.

**Acciones**:
1. El campo `content_proposals.sensibilidad` existe pero hoy no bloquea nada en el código (gap documentado en [`politica-ia-y-gate-editorial.md`](./politica-ia-y-gate-editorial.md) §2.2) — hasta que se implemente, es responsabilidad del `director` revisar `sensibilidad` manualmente antes de usar `publish`.
2. Si se implementa el gap: exigir `review_comment` no vacío como evidencia de revisión antes de permitir `publish` cuando `sensibilidad` sea alta.
3. Registrar la decisión — `review_comment` + `updated_at` + `author_id` ya cubren esto sin tabla de auditoría nueva.

**Condición de salida**: la propuesta se publica con evidencia de revisión registrada, o se rechaza (`review_comment` con el motivo).
