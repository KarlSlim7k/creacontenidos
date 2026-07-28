# Casos de uso para Hermes completo

> Estado: propuesta futura. El backend actual cubre el flujo editorial, cron y Telegram; Hermes no es requisito para operar CREA hoy.

## Objetivo

Usar Hermes como agente orquestador solo cuando CREA necesite coordinar conversaciones, herramientas y procesos entre varios canales. No debe reemplazar el gate editorial: una publicación sigue requiriendo aprobación explícita de un director en CREA.

## Casos que sí justifican Hermes

### 1. Bandeja única de instrucciones

Un director o colaborador escribe por Telegram, Slack, WhatsApp o correo: “prepara seguimiento de esta nota” o “muéstrame pendientes”. Hermes identifica a la persona, conserva el contexto de la conversación y ejecuta la misma acción en CREA.

Valor: evita copiar mensajes entre canales y el panel.

Condición: roles, identidad y permisos deben resolverse contra CREA; Hermes no autoriza publicaciones por cuenta propia.

### 2. Cobertura guiada de un tema

Ante una noticia local, Hermes reúne fuentes permitidas, crea una ficha en RADAR, propone ángulos, solicita al director una decisión y, tras aprobarla, inicia el borrador en el content engine.

Valor: reduce pasos manuales entre investigación, propuesta y producción.

Condición: las fuentes y resultados quedan guardados en CREA; el agente no puede convertir rumores en nota publicable.

### 3. Seguimiento editorial proactivo

Hermes detecta piezas detenidas: borradores sin movimiento, devoluciones sin respuesta o revisiones pendientes. Envía recordatorios adecuados a quien corresponde y escala al director solo cuando se rebasa un plazo.

Valor: mejora tiempos de producción sin perseguir manualmente al equipo.

Condición: reglas de plazos, destinatarios y frecuencia son configurables; no se deben enviar avisos repetidos.

### 4. Operación comercial multicanal

Un prospecto llega por Telegram, WhatsApp o correo. Hermes extrae los datos, crea o actualiza el lead, prepara un resumen y recuerda el siguiente seguimiento al responsable comercial.

Valor: reduce capturas manuales y leads perdidos.

Condición: antes de crear clientes, enviar cotizaciones o cambiar etapas sensibles, pide confirmación humana.

### 5. Asistente de distribución con contexto

Después de publicar, Hermes prepara variantes para Facebook, WhatsApp y otros canales, propone horarios y deja las piezas listas para revisión. Puede reportar qué canal no se distribuyó o qué enlace falló.

Valor: unifica la distribución sin convertir al agente en publicador autónomo.

Condición: la publicación externa conserva el permiso de director y la bitácora de CREA.

### 6. Brief operativo diario

Cada mañana Hermes consolida RADAR, agenda, estado editorial, pendientes comerciales y métricas relevantes en un resumen breve por Telegram o Slack.

Valor: una sola vista accionable para dirección.

Condición: consume datos de las APIs de CREA y cita enlaces internos; no inventa cifras ni hechos.

## Cuándo no usar Hermes

- Generar slugs, validar campos, cambiar estados simples o programar un cron fijo.
- Aprobar o devolver notas desde Telegram.
- Enviar el resumen editorial diario a las 08:00 CDMX.
- Consultas o integraciones que el backend actual resuelve con una ruta, una tabla o un cliente HTTP.

En esos casos, Hermes añadiría infraestructura, mantenimiento y superficie de seguridad sin aportar capacidad real.

## Señales para decidir el despliegue

Evaluar Hermes cuando se cumplan al menos dos condiciones:

1. El equipo usa de forma frecuente dos o más canales de trabajo y pierde contexto entre ellos.
2. Hay tareas encadenadas que requieren tres o más sistemas, por ejemplo Telegram → RADAR → borrador → distribución.
3. Los recordatorios y automatizaciones actuales empiezan a requerir memoria conversacional o decisiones según contexto.
4. Existe una persona responsable de operar credenciales, actualizaciones, observabilidad y respuesta a incidentes del agente.

## Requisitos antes de producción

- VPS o servicio aislado para Hermes, sin acceso directo e ilimitado a Postgres.
- API de CREA como única vía para modificar contenido, con cuentas de servicio y permisos mínimos.
- Lista explícita de herramientas permitidas por canal y por rol.
- Registro de cada acción, prompts relevantes, herramienta invocada y resultado.
- Aprobación humana para publicar, distribuir, enviar comunicaciones externas o modificar datos comerciales.
- Límites de costo, rate limits, timeouts y mecanismo para apagar el agente sin afectar CREA.

## Ruta recomendada

Primero estabilizar Telegram y la aprobación editorial actual. Después añadir comandos puntuales al backend. Solo cuando esos comandos requieran memoria, múltiples canales y herramientas encadenadas, desplegar Hermes como una capa separada y acotada.
