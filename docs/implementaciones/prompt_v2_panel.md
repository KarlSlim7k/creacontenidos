## Contexto del proyecto

Estás trabajando en **CREA Contenidos**, un monorepo para un equipo de contenido editorial en Perote, Puebla (México). El stack es:

- **Backend**: Express 4 + PostgreSQL 16 (Docker) → `apps/api/`
- **Frontend admin**: Vanilla JS SPA (sin framework) → `apps/admin/assets/js/panel.js` (1200+ líneas, un solo IIFE)
- **Autenticación**: JWT con 4 roles: director (acceso total), produccion, comercial, colaborador
- **Config**: `apps/api/src/config/index.js` (dotenv)
- **Migraciones SQL**: `apps/api/src/db/migrations/` (001-016 existentes)
- **Módulos API**: `apps/api/src/modules/` — auth, editorial, listening, content-engine, commercial, social, distribution, public

El panel admin tiene 13 pantallas. Varias están completas, pero hay gaps específicos que necesitas cerrar.

## IMPORTANTE — Lee estos archivos primero

Antes de escribir cualquier código, lee estos archivos para entender los patrones existentes:

1. `apps/api/src/modules/editorial/index.js` — cómo están hechos los endpoints (patrón, validación, queries)
2. `apps/api/src/modules/commercial/index.js` — idem para comercial
3. `apps/api/src/modules/auth/index.js` — endpoints de auth y users
4. `apps/api/src/modules/auth/role-modules.js` — mapeo de roles a módulos
5. `apps/api/src/middleware/auth.js` — requireAuth, requireRole
6. `apps/api/src/server.js` — cómo se montan los routers
7. `apps/api/src/config/index.js` — variables de entorno
8. `apps/admin/assets/js/panel.js` — TODO el frontend (lee completo, es un solo archivo)
9. `apps/api/src/db/migrations/` — lee las últimas 4 migraciones para entender el patrón de naming y los tipos usados

## Convenciones que DEBES seguir

- NO uses TypeScript. Todo es JavaScript vanilla CommonJS (require/module.exports)
- NO uses frameworks en frontend. Todo es vanilla JS con string-template HTML
- Los endpoints usan `async (req, res, next)` con try/catch que llama `next(err)`
- Las queries usan `pool.query()` con parámetros posicionales ($1, $2...)
- Los roles se validan con `requireRole('director', 'produccion')` middleware
- El frontend usa `adminApi(path, opts)` para todas las llamadas (ya definido)
- El frontend usa `setState(patch)` para actualizar estado y re-renderizar
- Los handlers de click están en `handleClick()` con un switch/case por `data-action`
- Usa `esc()` para escapar HTML en el frontend
- Usa `badge()` para badges de estado
- Usa `loadingCard()` para estados de carga
- NO agregues dependencias npm. Todo con lo que ya está instalado
- Las migraciones SQL van en `apps/api/src/db/migrations/` con formato `NNN_descripcion.sql`
- El idioma de la UI y los comentarios es español

## Tareas a implementar

### Tarea 1: Eliminar ideas

**Backend** — En `apps/api/src/modules/editorial/index.js`:
- Agregar `DELETE /ideas/:id` con `requireRole('director')`
- `DELETE FROM story_ideas WHERE id = $1 RETURNING id`
- Si no existe, 404

**Frontend** — En `panel.js`:
- En `ideaCard()`, cuando `canMove` es true Y el rol es director, agregar un botón pequeño "Eliminar" con `data-action="delete-idea"` y `data-id`
- En `handleClick()`, agregar case `'delete-idea'` que llame a `submitDeleteIdea(id)`
- Función `submitDeleteIdea(id)` que hace `adminApi('/api/editorial/ideas/' + id, { method: 'DELETE' })` y refresca `state.data.ideas`

### Tarea 2: Crear cliente desde admin

**Backend** — En `apps/api/src/modules/commercial/index.js`:
- Agregar `POST /clients` con `requireRole('comercial', 'director')`
- Campos: name (requerido), business_name, package, phone, email, pipeline_stage (default 'identificado')
- Validar que name no esté vacío
- `INSERT INTO clients (...) VALUES (...) RETURNING ...`
- Asignar `owner_id = req.user.id`

**Frontend** — En `panel.js`:
- Agregar estado `clientFormOpen: false, clientFormError: null` al state inicial
- En `renderComercial()`, agregar botón "+ Nuevo cliente" (solo para comercial/director) que toggle `clientFormOpen`
- Formulario inline con campos: nombre, negocio, paquete (select: básico, profesional, premium), teléfono, email
- En `handleClick()`, cases `open-client-form`, `close-client-form`, `submit-new-client`
- `submitNewClient()` hace POST, refresca clients, cierra formulario

### Tarea 3: Eliminar cliente

**Backend** — En `apps/api/src/modules/commercial/index.js`:
- Agregar `DELETE /clients/:id` con `requireRole('director')`

**Frontend** — En `panel.js`:
- En la tarjeta de cliente (columna kanban), botón "Eliminar" solo para director
- Handler `delete-client` → DELETE → refresca clients

### Tarea 4: Eliminar propuestas rechazadas

**Backend** — En `apps/api/src/modules/editorial/index.js`:
- Agregar `DELETE /proposals/:id` con `requireRole('director')`
- Verificar que el status sea 'rechazada' antes de borrar
- Si status != rechazada, responder 409

**Frontend** — En `panel.js`:
- En la vista de propuestas, mostrar botón eliminar solo sobre propuestas con status `rechazada`
- Handler `delete-proposal` → DELETE → refresca propuestas

### Tarea 5: Tabla activity_log + endpoints

**Migración** — Crear `apps/api/src/db/migrations/017_create_activity_log.sql`:
```sql
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  detail TEXT,
  user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'exito',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Endpoint** — En `apps/api/src/modules/auth/index.js` (al final, antes del module.exports):
- `GET /admin/activity` con `requireRole('director')`
- Query param opcional `limit` (default 20, max 50)
- `SELECT al.*, u.name AS user_name FROM activity_log al LEFT JOIN users u ON u.id = al.user_id ORDER BY created_at DESC LIMIT $1`

**Endpoint de integraciones** — También en auth/index.js:
- `GET /admin/integrations` con `requireAuth`
- Devolver array con el estado de cada integración verificando env vars:
  - Nous Portal: `process.env.NOUS_PORTAL_API_KEY` existe
  - WordPress: `process.env.WORDPRESS_URL` existe
  - Meta: `process.env.FACEBOOK_APP_TOKEN` existe
  - ElevenLabs: `process.env.ELEVENLABS_API_KEY` existe

### Tarea 6: Métricas reales

**Backend** — Modificar `GET /api/editorial/metrics` en `apps/api/src/modules/editorial/index.js`:

Agregar al response existente:
- `totalPieces`: count total de propuestas con status='published'
- `approvalRate`: published / (published + rechazadas) redondeado a 2 decimales
- `avgDraftDays`: AVG de días entre created_at y published_at para las publicadas
- `topSections`: array de { section, count } agrupado por section, top 5
- `authors`: array de { name, published } agrupado por author_id, join con users

**Frontend** — Modificar `renderMetricas()` en `panel.js`:
- Donde dice "Sin datos aún — no hay integración de analytics conectada" para ALCANCE TOTAL, reemplazar con:
  - Total piezas publicadas (histórico)
  - Tasa de aprobación (%)
  - Tiempo promedio de producción (días)
- Donde dice "Sin datos aún" para CRECIMIENTO POR CANAL, reemplazar con:
  - Top secciones con barras CSS simples (div con width porcentual)
  - Ranking de autores por publicaciones

### Tarea 7: Hermes real

**Frontend** — Modificar `renderHermes()` en `panel.js`:
- Agregar al `loadScreenData`: cuando screen === 'hermes', fetch `/api/admin/activity?limit=20` y guardar en state.data.activity
- Reemplazar `hermesLogData` hardcodeado con `state.data.activity`
- Cada fila muestra: timestamp relativo (ej: "hace 2h"), detail, status (éxito/fallo)
- Skills: agrupar activity por action type y contar (ej: "Generación de borradores: 12 usos")
- Quitar el `STATIC_NOTE` de esta pantalla
- Si no hay datos, mostrar "Sin actividad registrada todavía."

### Tarea 8: Buenos días, Perote real

**Backend** — En `apps/api/src/modules/editorial/index.js`:
- Agregar `GET /pipeline` con `requireAuth`
- Buscar la propuesta más reciente que podría ser del boletín (por ahora, la más reciente con status != 'rechazada')
- Mapear su status a pasos del pipeline:
  - Si existe cualquier propuesta → Social listening = completado
  - Si status >= borrador → Borrador generado = completado
  - Si status = en_revision → Aprobación manual = esperando
  - Si status = published → Aprobación manual = completado
  - Los demás pasos (clima, audio, envío) = pendiente
- Devolver array de steps con { label, status, at }

**Frontend** — Modificar `renderPipeline()` en `panel.js`:
- Fetch `/api/editorial/pipeline` en loadScreenData cuando screen === 'pipeline'
- Reemplazar `pipelineStepsData` hardcodeado con datos reales
- Quitar `STATIC_NOTE`
- Si no hay datos, mostrar pipeline vacío con todos los pasos en pendiente

### Tarea 9: Integraciones reales

**Frontend** — Modificar `renderConfigIntegraciones()` en `panel.js`:
- En `loadScreenData`, cuando screen === 'configuracion' y configTab === 'integraciones', fetch `/api/admin/integrations`
- Guardar en `state.data.integrations`
- Reemplazar `integracionesData` hardcodeado con datos del fetch
- Mostrar "Conectado" (verde) o "Desconectado" (gris) según el campo `connected`

### Tarea 10: Notificaciones

**Frontend** — Modificar `renderBellAndNotifs()` en `panel.js`:
- Cuando `showNotifications` es true, fetch `/api/admin/activity?limit=5`
- Mostrar cada item como notificación: detail + tiempo relativo
- Guardar en localStorage un timestamp `lastNotifSeen` para marcar como "visto"
- Badge numérico en la campana: count de items más recientes que lastNotifSeen
- Si no hay actividad, mostrar "Sin actividad reciente."

### Tarea 11: Distribución (solo documentación)

**Backend** — En `apps/api/src/modules/distribution/index.js`:
- Agregar comentarios documentando los endpoints futuros:
  - POST /distribution/facebook → Meta Graph API (requiere FACEBOOK_APP_TOKEN)
  - POST /distribution/whatsapp → Generación de link (requiere número configurado)
  - POST /distribution/wordpress → WordPress REST API (requiere WORDPRESS_URL + credenciales)
- NO implementar lógica, solo comentarios

## Orden sugerido

1. Tarea 5 (activity_log) — base para otras tareas
2. Tarea 1-4 (CRUD gaps) — independientes entre sí
3. Tarea 6 (métricas) — solo backend + frontend
4. Tarea 7 (Hermes) — depende de Tarea 5
5. Tarea 8 (Pipeline) — depende de endpoint nuevo
6. Tarea 9 (Integraciones) — depende de Tarea 5
7. Tarea 10 (Notificaciones) — depende de Tarea 5
8. Tarea 11 (Distribución) — solo comentarios

## Validación

Después de cada tarea:
1. Verificar que la migración SQL corre sin errores (si aplica)
2. Verificar que el endpoint responde correctamente con curl o desde el panel
3. Verificar que el frontend renderiza sin errores en consola del navegador
4. Verificar que los permisos de rol funcionan (un colaborador no debería ver botones de eliminar)

Al final de todo:
- `node apps/api/src/db/migrate.js` debe correr limpio
- Levantar el servidor y navegar cada pantalla del panel
- Verificar que no quedan `STATIC_NOTE` ni arrays hardcodeados (hermesLogData, pipelineStepsData, integracionesData deben estar eliminados o vacíos)
