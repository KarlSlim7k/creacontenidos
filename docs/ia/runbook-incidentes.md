# Runbook de incidentes de producción

Este documento cubre el portal, API, Postgres, respaldos, proveedores de IA y
distribución. No incluye secretos ni datos personales. La restauración detallada
vive en [`../operacion-backups.md`](../operacion-backups.md).

## Responsables y tiempos

- Responsable primario: Karol Delgado.
- Responsable alterno: **pendiente de designar antes del lanzamiento**.
- Objetivo inicial para una caída total o pérdida de acceso a la API: confirmar
  recepción en 15 minutos y escalar al alterno a los 30 minutos.
- RTO de la base de datos: 2 horas. RPO: 24 horas.

La persona que recibe una alerta debe registrar hora, síntoma, alcance, acciones y
hora de recuperación. Si existe riesgo de pérdida de datos, no reiniciar ni
restaurar hasta conservar una copia del estado afectado.

## Cobertura de monitoreo

Estado al 1 de agosto de 2026:

| Superficie | Comprobación externa | Estado |
|---|---|---|
| Portal | `https://crea-contenidos.com/`, HTTP 200 y keyword `CREA Contenidos` | Solicitud de UptimeRobot enviada; falta confirmar el alta y configurar la keyword |
| API + Postgres | `https://crea-contenidos.com/api/public/articles?limit=1`, HTTP 200 y JSON válido | Solicitud de UptimeRobot enviada; falta confirmar el alta |
| TLS/dominio | Aviso de expiración del certificado del monitor del portal | Pendiente de activar en UptimeRobot |
| Backup local | Heartbeat diario con gracia máxima de 26 horas | Activo; señales de fallo y recuperación aceptadas, falta confirmar la recepción de ambas alertas |
| Excepciones de API | Sentry, proyecto `crea-command-center-api` | Inactivo: falta guardar un DSN real en Dokploy y volver a verificar una alerta |

Los monitores web deben comprobar cada 5 minutos y enviar alertas DOWN y UP al
correo operativo. No se considera terminado el alta hasta recibir una alerta de
prueba y su recuperación. El uptime externo no sustituye el seguimiento de
excepciones: un HTTP 200 puede contener un error funcional.

## 1. Caída del portal o de la API

**Síntoma**: alerta del portal, respuesta distinta de 200, keyword ausente o
respuesta inválida de la ruta pública.

1. Confirmar desde otra red:

   ```bash
   curl -fsS https://crea-contenidos.com/ | grep -Fq 'CREA Contenidos'
   curl -fsS 'https://crea-contenidos.com/api/public/articles?limit=1'
   ```

2. Si falla solo el portal, revisar el estado y los logs del compose en Dokploy,
   además de DNS y Cloudflare. Si falla también la API, revisar primero el proceso
   de la aplicación y después Postgres.
3. Reiniciar o redeployar únicamente cuando los logs indiquen un proceso detenido
   o una versión fallida. No usar el redeploy como diagnóstico.
4. Tras la corrección, repetir ambas llamadas y esperar la alerta UP.

**Salida**: portal con keyword presente, API con JSON válido y recuperación
externa notificada.

## 2. Falla de Postgres

**Síntoma**: la portada puede cargar parcialmente, pero la ruta API devuelve 5xx,
timeout o error de conexión.

1. Revisar en Dokploy que el servicio `db` esté activo y leer los logs de la API y
   Postgres alrededor de la hora de la alerta.
2. Comprobar almacenamiento, memoria y conexiones antes de reiniciar.
3. Si hay corrupción o pérdida, detener escrituras, conservar una copia del
   volumen y seguir la restauración aislada de
   [`../operacion-backups.md`](../operacion-backups.md). Nunca restaurar primero
   sobre `crea_command_center` de producción.
4. Validar la restauración con conteos y una lectura real desde la ruta pública
   antes de cambiar la aplicación a la base recuperada.

**Salida**: API pública responde JSON válido, los conteos esperados coinciden y no
hay errores nuevos de conexión.

## 3. Backup omitido o inválido

**Síntoma**: alerta del heartbeat después de 26 horas sin señal.

1. No enviar un ping manual para silenciar la alerta.
2. Revisar el log local del backup, espacio en disco, permisos y disponibilidad de
   Postgres. La URL del heartbeat nunca debe aparecer en comandos compartidos ni
   en logs.
3. Ejecutar el script de backup solo después de corregir la causa. Confirmar que
   el dump nuevo pasa su validación y que la señal se envía al final.
4. Verificar también el último objeto externo de R2. Si falta o está dañado,
   ejecutar el backup manual de Dokploy y repetir una restauración aislada.

**Salida**: dump local válido, objeto externo reciente y heartbeat recuperado. El
objetivo sigue siendo RPO de 24 horas.

## 4. Caída de proveedores de RADAR o generación

**Síntoma**: timeout, 429 o 5xx en `radar_detect*`, `generate_*` o tareas de
newsletter.

1. RADAR intenta Firecrawl cuando existen clave y fuentes configuradas. Si no está
   disponible o falla, continúa con Perplexity. Revisar `activity_log` para saber
   qué proveedor y modelo fallaron.
2. La generación tiene un intento con `AI_MODEL_FALLBACK` dentro del mismo Nous
   Portal. Si fallan ambos modelos, no existe todavía un fallback de proveedor;
   dejar el tema pendiente y reintentar cuando el servicio se recupere.
3. No cambiar de proveedor ni copiar prompts o respuestas a herramientas externas
   durante el incidente. Si la caída afecta el cierre editorial, avisar al equipo
   por el canal operativo; Telegram puede seguir usándose si está disponible.
4. Evitar disparos manuales repetidos: pueden duplicar costo y agravar un rate
   limit. El cron de RADAR vuelve a intentar en su siguiente ciclo de 6 horas.

**Salida**: un ciclo termina con estado exitoso y los temas pendientes vuelven a
procesarse sin duplicados.

## 5. Error de distribución

**Síntoma**: Facebook o WordPress rechaza una publicación, o WhatsApp no devuelve
el enlace esperado.

1. La distribución actual es manual mediante rutas protegidas del panel; no hay
   cron de distribución ni reintento automático.
2. Revisar el intento en `published_content` y `activity_log`. Cada intento, incluso
   el fallido, queda registrado.
3. Corregir credenciales, permisos o disponibilidad del canal y reintentar una
   sola vez desde el panel. Verificar antes que la nota esté publicada y que su
   URL pública abra correctamente.
4. Si el canal sigue caído, publicar manualmente como contingencia y documentar
   el enlace; no insertar ni modificar filas directamente en producción.

**Salida**: existe un intento `ok` con URL válida o la contingencia quedó
documentada para conciliación posterior.

## 6. Contenido sensible detectado

**Síntoma**: una propuesta con sensibilidad alta llega al gate editorial.

1. El campo `content_proposals.sensibilidad` existe pero todavía no bloquea la
   publicación. El director debe revisarlo antes de usar `publish`.
2. Registrar la decisión y el motivo en `review_comment`; rechazar el contenido si
   no puede verificarse.

**Salida**: propuesta publicada con evidencia de revisión o rechazada con motivo.

## Manejo seguro de evidencia

- Se pueden registrar códigos HTTP, timestamps, acción, proveedor, modelo, conteos
  y mensajes de error recortados.
- No registrar prompts completos, JWT, cookies, claves, correos, cuerpos de leads,
  URLs privadas de heartbeat ni respuestas completas de proveedores.
- Capturas o archivos de diagnóstico deben ocultar esos valores antes de
  compartirse.
- Cuando está habilitado, Sentry excluye usuario, IP, request, headers, cuerpos,
  query strings, breadcrumbs, variables locales y entradas/salidas de IA.

## Pruebas de aceptación pendientes

1. Activar los dos monitores solicitados, añadir keyword y alertas TLS/dominio.
2. Probar DOWN/UP con un monitor temporal a una URL 404; no detener producción.
3. Confirmar que llegaron las alertas de fallo y recuperación del heartbeat
   enviadas el 1 de agosto de 2026.
4. Guardar un DSN real de Sentry en la configuración persistente de Dokploy,
   desplegar y comprobar una excepción sintética sin PII y su alerta.
5. Designar al responsable alterno y confirmar que ambos reciben alertas.

El despliegue de la fase 5 reveló que el valor persistente de `SENTRY_DSN` era el
ejemplo con `...`, no un DSN válido. Se dejó vacío para que el SDK permanezca
inactivo sin emitir errores al arrancar. Una prueba previa no sustituye la
persistencia del secreto: Sentry se considera pendiente hasta repetirla después
de un redeploy normal de Dokploy.
