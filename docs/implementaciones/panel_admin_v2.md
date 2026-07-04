# Panel Admin v2 — Completar pantallas faltantes y CRUD gaps

> Cubre todo lo que NO está en panel_admin_v1.md (RADAR, content engine, editor IA, QA).
> Dependencias: v1 debe estar terminado o al menos tener ai-client.js listo.

---

## Estado actual por pantalla

| Pantalla | Estado | Qué falta |
|----------|--------|-----------|
| Dashboard | ✅ | — |
| RADAR | ⚠️ | Detección manual (v1) |
| Propuestas IA | ✅ | — |
| Bandeja de ideas | ⚠️ | Delete de ideas |
| Editor de nota | ⚠️ | Generación IA (v1), QA (v1) |
| Aprobación | ✅ | — |
| Producciones | ✅ | — |
| Pipeline comercial | ⚠️ | Crear cliente, delete cliente |
| Métricas | ⚠️ | Alcance total, crecimiento por canal |
| Hermes | 🔴 | Todo es mock estático |
| Buenos días, Perote | 🔴 | Todo es mock estático |
| Configuración | ⚠️ | Integraciones todas "Desconectado" |
| Notificaciones | 🔴 | Placeholder vacío |
| Distribución | 🔴 | Módulo vacío |

---

## 1. CRUD gaps — endpoints y frontend

### 1a. Eliminar ideas

**Endpoint**: `DELETE /api/editorial/ideas/:id`
**Roles**: director, produccion
**Frontend**: botón "Descartar" en la tarjeta de idea (kanban), o mover a "descartada" ya existe — agregar hard delete solo para director.

```
Archivo: apps/api/src/modules/editorial/index.js
  + DELETE /ideas/:id → DELETE FROM story_ideas WHERE id = $1

Archivo: apps/admin/assets/js/panel.js
  + Botón eliminar en ideaCard() cuando role=director
  + Handler delete-idea en handleClick
  + Función submitDeleteIdea → adminApi DELETE → refresca ideas
```

### 1b. Crear cliente desde admin

**Endpoint**: `POST /api/commercial/clients`
**Roles**: comercial, director
**Frontend**: formulario inline en Pipeline Comercial (similar a "+ Agregar URL" de Producciones).

```
Archivo: apps/api/src/modules/commercial/index.js
  + POST /clients → INSERT INTO clients (name, business_name, package, phone, email, pipeline_stage, owner_id)

Archivo: apps/admin/assets/js/panel.js
  + Estado clientFormOpen, clientFormError
  + Formulario: nombre, negocio, paquete, teléfono, email
  + Handler submit-new-client → adminApi POST → refresca clients
```

Campos del formulario:
- Nombre del contacto (requerido)
- Negocio / empresa
- Paquete de interés (select: básico, profesional, premium)
- Teléfono
- Email
- Pipeline stage (default: identificado)

### 1c. Eliminar cliente

**Endpoint**: `DELETE /api/commercial/clients/:id`
**Roles**: director

```
Archivo: apps/api/src/modules/commercial/index.js
  + DELETE /clients/:id

Archivo: apps/admin/assets/js/panel.js
  + Botón eliminar en tarjeta de cliente (solo director)
  + Handler delete-client
```

### 1d. Eliminar propuestas rechazadas

**Endpoint**: `DELETE /api/editorial/proposals/:id`
**Roles**: director
**Restricción**: solo propuestas con status `rechazada`

```
Archivo: apps/api/src/modules/editorial/index.js
  + DELETE /proposals/:id → verificar status=rechazada, luego DELETE

Archivo: apps/admin/assets/js/panel.js
  + En vista de propuestas, botón eliminar sobre rechazadas
```

---

## 2. Métricas — datos reales

### Problema
Las secciones "Alcance total" y "Crecimiento por canal" muestran "Sin datos aún". La tabla `content_proposals` tiene `published_at` pero no hay tracking de vistas, compartidos, ni engagement.

### Solución para pruebas (sin analytics real)
Contar lo que SÍ tenemos en la base de datos y proyectar métricas útiles:

**Endpoint modificado**: `GET /api/editorial/metrics` (ya existe, ampliar response)

Agregar al response existente:
```json
{
  "piecesPublished": 3,
  "weeklyGoal": 10,
  "weeklyPieces": [...],
  "totalPieces": 24,
  "avgDraftDays": 2.3,
  "approvalRate": 0.85,
  "topSections": [
    { "section": "Local", "count": 12 },
    { "section": "Cultura", "count": 8 }
  ],
  "authors": [
    { "name": "Karol", "published": 10 },
    { "name": "Luis", "published": 6 }
  ]
}
```

**Frontend**: reemplazar "Sin datos aún" con:
- Total de piezas publicadas histórico
- Tiempo promedio borrador → publicación
- Tasa de aprobación (publicadas / total propuestas)
- Top secciones (barra horizontal simple)
- Ranking de autores por publicaciones

```
Archivo: apps/api/src/modules/editorial/index.js
  + Ampliar query de /metrics con las nuevas métricas

Archivo: apps/admin/assets/js/panel.js
  + renderMetricas(): reemplazar placeholders con datos reales
  + Gráfica de secciones (barras CSS, no librería)
  + Tabla de ranking de autores
```

**Cuando haya analytics reales** (futuro): agregar `page_views`, `shares` a la tabla de artículos o a una tabla nueva `article_metrics`, y poblar vía API de WordPress/Meta. Este diseño no interfiere con eso.

---

## 3. Hermes — pantalla real

### Problema
Toda la pantalla usa `hermesLogData` y `hermesSkillsData` (hardcodeados). El label dice "fuera de alcance".

### Solución
Conectar a datos reales de lo que el sistema hace. Hermes pasa de ser "estado de un agente externo" a "bitácora de actividad del sistema".

**Tabla nueva**: `activity_log`

```sql
-- Migration 017
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,        -- 'radar_detect', 'proposal_generate', 'draft_generate', 'qa_check', 'publish'
  detail TEXT,                 -- descripción legible
  user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'exito',  -- 'exito' | 'fallo'
  metadata JSONB,              -- datos extra (tokens usados, modelo, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Endpoint nuevo**: `GET /api/admin/activity?limit=20`

```
Archivo: apps/api/src/db/migrations/017_create_activity_log.sql  ← NUEVO
Archivo: apps/api/src/modules/auth/index.js (o nuevo módulo admin)
  + GET /admin/activity → SELECT FROM activity_log ORDER BY created_at DESC LIMIT $1
```

**Poblar el log**: cada acción del content engine (v1) escribe en `activity_log`:
- RADAR detect → acción + topics encontrados
- Generar propuesta → acción + format + modelo usado
- Generar borrador → acción + proposal_id
- QA check → acción + score + issues encontrados

**Frontend**: reemplazar `hermesLogData` hardcodeado con fetch real.

```
Archivo: apps/admin/assets/js/panel.js
  + renderHermes(): fetch /api/admin/activity, pintar log real
  + Skills sección: mostrar stats agrupadas por action type
    (cuántas detecciones, cuántos borradores generados, etc.)
  + Quitar STATIC_NOTE
```

**Migración gradual**: en pruebas el log se llena con las acciones de v1. En producción se puede expandir para incluir errores de distribución, integraciones, etc.

---

## 4. Buenos días, Perote — pipeline real

### Problema
6 pasos hardcodeados, todos "Pendiente — sin automatización". El pipeline representa el flujo diario de producción del boletín "Buenos días, Perote".

### Solución
Conectar el pipeline al flujo real de propuestas. Cada vez que se procesa una propuesta para este formato, registrar el avance.

**Endpoint nuevo**: `GET /api/editorial/pipeline?format=boletin`

Devuelve el estado del pipeline para la producción más reciente:
```json
{
  "steps": [
    { "label": "Social listening", "status": "completado", "at": "2026-07-03T07:02:00Z" },
    { "label": "Borrador generado", "status": "completado", "at": "2026-07-03T07:14:00Z" },
    { "label": "Clima agregado", "status": "pendiente", "at": null },
    { "label": "Aprobación manual", "status": "esperando", "at": null },
    { "label": "Audio generado", "status": "pendiente", "at": null },
    { "label": "Envío", "status": "pendiente", "at": null }
  ]
}
```

**Lógica**: mapear el status de la última propuesta con `format=boletin` (o taggeada como tal) a los pasos del pipeline:
- Existe topic relacionado → "Social listening" = completado
- Propuesta en status `borrador` o superior → "Borrador generado" = completado
- Propuesta en `en_revision` → "Aprobación manual" = esperando
- Propuesta en `published` → "Aprobación manual" = completado
- Los pasos de clima, audio y envío requieren los módulos de distribución (futuro)

```
Archivo: apps/api/src/modules/editorial/index.js
  + GET /pipeline → query + lógica de mapeo

Archivo: apps/admin/assets/js/panel.js
  + renderPipeline(): fetch /api/editorial/pipeline, pintar pasos reales
  + Quitar pipelineStepsData hardcodeado
  + Quitar STATIC_NOTE
```

**Limitación en pruebas**: los pasos 3 (clima), 5 (audio) y 6 (envío) seguirán "pendiente" porque dependen de módulos no implementados. Los pasos 1, 2 y 4 serán reales.

---

## 5. Integraciones — estado real

### Problema
Las 4 integraciones (Notion, Hermes Agent, WordPress, Buffer) muestran "Desconectado" siempre. Es un array hardcodeado.

### Solución
Conectar el estado a variables de entorno reales. Si la API key existe → "Conectado". Si no → "Desconectado".

**Endpoint nuevo**: `GET /api/admin/integrations`

```json
{
  "integrations": [
    { "name": "Nous Portal", "desc": "Modelos IA + herramientas", "connected": true },
    { "name": "WordPress", "desc": "Publicación del sitio", "connected": false },
    { "name": "Meta (Facebook/Instagram)", "desc": "oEmbed + publicación", "connected": false },
    { "name": "ElevenLabs", "desc": "Generación de audio", "connected": false }
  ]
}
```

**Lógica**: verificar en backend si existe la env var correspondiente:
- `NOUS_PORTAL_API_KEY` → Nous Portal
- `WORDPRESS_URL` + `WORDPRESS_USER` → WordPress
- `FACEBOOK_APP_TOKEN` → Meta
- `ELEVENLABS_API_KEY` → ElevenLabs

Reemplazar las integraciones hardcodeadas (Notion, Buffer) por las que realmente usa el sistema.

```
Archivo: apps/api/src/modules/auth/index.js (o endpoint admin genérico)
  + GET /admin/integrations → check env vars

Archivo: apps/admin/assets/js/panel.js
  + Quitar integracionesData hardcodeado
  + renderConfigIntegraciones(): fetch /api/admin/integrations
  + Actualizar permisosMatrix si cambian los módulos
```

---

## 6. Notificaciones — datos reales

### Problema
El panel de notificaciones siempre dice "Sin notificaciones automáticas todavía."

### Solución
Mostrar eventos recientes del `activity_log` como notificaciones. No es un sistema push — es un feed de lo que pasó recientemente.

```
Archivo: apps/admin/assets/js/panel.js
  + renderBellAndNotifs(): al abrir, fetch /api/admin/activity?limit=5
  + Mostrar: "RADAR detectó 3 nuevos temas" (hace 2h)
  + Mostrar: "Propuesta #15 aprobada" (hace 30min)
  + Badge con count de items no vistos (guardar lastSeen en localStorage)
```

**Alcance**: esto es un "activity feed", not notificaciones push. Para notificaciones reales (email, WhatsApp) se necesitaría un sistema de eventos, que es futuro.

---

## 7. Distribución — placeholder documentado

### Estado
Módulo vacío (`distribution/index.js` = router vacío).

### Acción
No implementar. Solo dejar documentados los endpoints que se necesitarán:

```
Archivo: apps/api/src/modules/distribution/index.js
  + Comentarios con los endpoints planeados:
    POST /distribution/facebook   → Meta Graph API
    POST /distribution/whatsapp   → Link generation
    POST /distribution/wordpress  → WordPress REST API
```

Esto se activará cuando haya API keys reales para estos servicios.

---

## Resumen de archivos impactados

### Backend nuevos/modificados

| Archivo | Acción |
|---------|--------|
| `src/db/migrations/017_create_activity_log.sql` | NUEVO |
| `src/modules/editorial/index.js` | + DELETE ideas, DELETE proposals, + GET /pipeline, + métricas extendidas |
| `src/modules/commercial/index.js` | + POST /clients, + DELETE /clients/:id |
| `src/modules/content-engine/index.js` | + escribir en activity_log cada acción (coordinar con v1) |
| `src/modules/auth/index.js` (o nuevo admin) | + GET /admin/activity, + GET /admin/integrations |
| `src/modules/distribution/index.js` | + comentarios de endpoints futuros |
| `src/config/index.js` | + env vars de integraciones (WORDPRESS_URL, etc.) |

### Frontend

| Archivo | Acción |
|---------|--------|
| `apps/admin/assets/js/panel.js` | Ver detalle por sección abajo |

Cambios en panel.js:
- `renderMetricas()`: reemplazar placeholders con datos reales + gráfica de secciones
- `renderHermes()`: fetch activity_log real, quitar hardcode
- `renderPipeline()`: fetch pipeline real, quitar hardcode
- `renderConfigIntegraciones()`: fetch integrations reales, quitar hardcode
- `renderBellAndNotifs()`: mostrar activity reciente
- `ideaCard()`: botón eliminar (director)
- `renderComercial()`: botón + formulario crear cliente, botón eliminar
- `renderPropuestas()`: botón eliminar sobre rechazadas
- `handleClick()`: handlers nuevos (delete-idea, delete-client, submit-new-client, delete-proposal)

---

## Orden de implementación

1. **CRUD gaps** (1a-1d) — independiente, se puede hacer en paralelo con v1
2. **activity_log** (tabla + endpoint) — base para Hermes y Notificaciones
3. **Métricas reales** (2) — solo backend + frontend, sin dependencias externas
4. **Hermes real** (3) — depende de activity_log
5. **Buenos días, Perote** (4) — depende de pipeline endpoint
6. **Integraciones reales** (5) — rápido, solo check de env vars
7. **Notificaciones** (6) — depende de activity_log
8. **Distribución** (7) — solo documentación, 5 minutos

---

## Presupuesto adicional

Las métricas, Hermes y Pipeline son queries a BD + frontend. No consumen tokens de IA. El costo es 0 adicionales sobre v1.

| Concepto | Costo tokens IA | Costo infra |
|----------|----------------|-------------|
| CRUD gaps | $0 | $0 |
| Métricas reales | $0 | $0 |
| Hermes real | $0 | $0 |
| Pipeline real | $0 | $0 |
| Integraciones | $0 | $0 |
| Notificaciones | $0 | $0 |
| **Total adicional** | **$0** | **$0** |

Todo esto es lógica de backend + frontend sobre datos que ya existen en la BD.
