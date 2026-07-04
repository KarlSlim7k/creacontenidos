---
title: "CREA CONTENIDOS"
subtitle: "Actualización de Stack de IA — Hermes Agent + Nous Portal + MiniMax"
version: "1.0"
fecha: "Julio 2026"
autor: "Emmanuel Reyes Zapata — Director Editorial, CREA Contenidos"
estado: "Documento vigente. Sustituye las secciones de stack de IA de los documentos anteriores para el periodo de prueba (Mes 1)."
---

# CREA Contenidos — Actualización de Stack de IA

## 0. Propósito de este documento

Los documentos previos de CREA (Especificación Técnica v2, Informe Técnico OpenClaw, Brief Desarrollador, Social Listening, Newsletter/Podcast, Canva Flujo) describen una arquitectura de IA basada en **múltiples proveedores contratados por separado**: ChatGPT/OpenAI, Claude API directa, Perplexity Pro, ElevenLabs, DALL·E, Grok, y automatización vía OpenClaw o Make.

Ese enfoque multi-API es válido a mediano plazo, pero **implica un costo de arranque más alto** al tener que dar de alta y pagar cada servicio por separado desde el mes 1.

Para el **mes de pruebas del despliegue de crea-contenidos.com**, CREA cambia de estrategia: se consolida el acceso a modelos de IA y herramientas (búsqueda web, TTS, generación de imagen, social listening) en **un solo punto de entrada** — **Hermes Agent** (Nous Research) operando sobre **Nous Portal**, con **MiniMax** como proveedor de modelo primario para la mayoría de las tareas.

**Este documento tiene prioridad sobre cualquier mención de OpenClaw, ChatGPT/OpenAI, Claude API directa, Perplexity Pro standalone, ElevenLabs standalone, DALL·E standalone o Make/Zapier como piezas independientes del stack de IA en los documentos anteriores.** Los módulos funcionales, roles, flujo editorial, gamificación y modelo comercial descritos en la Especificación Técnica v2 **no cambian** — solo cambia la capa de ejecución de IA que los sirve.

---

## 1. Decisión de arquitectura: un solo punto de entrada

### 1.1 Qué se reemplaza

| Elemento en documentación anterior | Estado para Mes 1 |
|---|---|
| OpenClaw (Mac mini M4) como agente orquestador | **Reemplazado.** Ya no se despliega Mac mini ni OpenClaw. |
| Claude API directa (`claude-sonnet-4-20250514`) contratada por separado | **Reemplazada.** Se accede a modelos vía Nous Portal cuando se necesite razonamiento superior. |
| ChatGPT-4o / OpenAI API contratada por separado | **Reemplazada.** MiniMax cubre redacción; Portal da acceso a otros modelos si hace falta. |
| Perplexity Pro como suscripción independiente | **Reemplazada.** Web search vía Tool Gateway de Nous Portal. |
| ElevenLabs contratado por separado | **Reemplazado.** TTS vía Tool Gateway de Nous Portal (o proveedor MiniMax de voz). |
| DALL·E 3 contratado por separado | **Reemplazado.** Generación de imagen vía Tool Gateway de Nous Portal. |
| Make / Zapier como middleware de automatización | **Pausado para Mes 1.** Hermes Agent cubre la orquestación (cron interno / Heartbeat propio) sin necesitar un middleware adicional en la fase de prueba. |
| Grok (xAI) para social listening en X | **Pendiente de evaluar.** Se prueba primero con el Web Search / RSS del Tool Gateway; si no es suficiente para X/Twitter, se añade como capa adicional en Mes 2. |

### 1.2 Qué se mantiene sin cambios

- Notion como base de datos operativa (IDEAS, PRODUCCIÓN, COMERCIAL, COLABORADORES, MÉTRICAS).
- WordPress/Webflow como CMS del sitio.
- WhatsApp Business y Telegram como canales de entrada del equipo.
- Buffer/Later para programación de redes (o publicación vía Tool Gateway si se resuelve por skill).
- Canva Pro + Bulk Create para la capa visual.
- Los 7 módulos funcionales, el flujo editorial de 8 etapas, el sistema de roles y la gamificación (UC) de la Especificación Técnica v2.
- El principio de aprobación humana obligatoria antes de publicar (regla de oro editorial CREA).

---

## 2. Componentes del nuevo stack de IA

### 2.1 Hermes Agent

Agente de código abierto (Nous Research, MIT license) que actúa como capa de orquestación entre el equipo CREA y las herramientas del ecosistema — cumple el mismo rol que OpenClaw cumplía en el Informe Técnico anterior, pero conectado a Nous Portal en lugar de a proveedores sueltos.

- Corre en el VPS Hostinger ya contratado (no requiere Mac mini dedicado).
- Se conecta a WhatsApp, Telegram y CLI.
- Incluye cron interno (equivalente al "Heartbeat" descrito en el informe de OpenClaw) para tareas programadas: brief matutino, revisión de pipeline comercial, publicación nocturna, ranking semanal de colaboradores.
- Soporta MCP, por lo que puede conectarse a Notion, WordPress y otras herramientas del stack mediante servidores MCP o skills equivalentes.
- Skills compatibles con el estándar abierto agentskills.io — reutilizables entre proyectos.

### 2.2 Nous Portal

Suscripción única que sustituye la necesidad de dar de alta cuentas separadas en OpenRouter, Anthropic, OpenAI, Perplexity, ElevenLabs y proveedores de generación de imagen.

Incluye, bajo un solo login y una sola factura:

- Acceso a más de 300 modelos (incluye MiniMax, Claude, GPT, Gemini, DeepSeek, Qwen, Kimi, GLM, Grok).
- **Tool Gateway**: búsqueda web, generación de imagen, texto a voz (TTS), automatización de navegador — sin necesidad de contratar Firecrawl, FAL, ElevenLabs o Browser Use por separado.

**Nota importante:** el plan gratuito de Nous Portal trae solo créditos simbólicos, insuficientes para operación real. Para el mes de pruebas se requiere un **plan de pago** de Nous Portal.

### 2.3 MiniMax como modelo primario

Se usa MiniMax (vía Nous Portal) como proveedor de modelo por defecto para la mayoría de las tareas editoriales rutinarias: redacción de notas, clasificación de ideas, generación de copys para redes, borradores de guiones.

Razón: costo por millón de tokens sensiblemente menor que los modelos premium (Claude Sonnet/Opus, GPT), manteniendo calidad suficiente para producción editorial estándar.

Se reserva un modelo de razonamiento superior (disponible en el mismo Portal, sin contrato adicional) únicamente para:

- Revisión editorial final de piezas sensibles o branded content de alto valor.
- Análisis contextual profundo del módulo RADAR cuando el tema lo amerite.

Esta lógica es la misma idea de "estrategia híbrida" que ya existía en el Informe Técnico OpenClaw (modelo económico para lo rutinario + modelo premium para lo complejo) — solo que ahora ambos niveles se contratan **dentro de la misma suscripción de Portal**, no como cuentas independientes.

### 2.4 Social listening durante el mes de pruebas

Para el mes 1, el social listening se cubre con:

- **Web Search del Tool Gateway** (sustituye a Perplexity Sonar API como capa de detección rápida de temas).
- RSS de noticias locales, vía skill de Hermes.

El scraping profundo de Facebook/TikTok/Instagram descrito en `CREA_Social_Listening.md` (Apify) **se pospone** para después del mes de pruebas, salvo que el Web Search del Tool Gateway resulte insuficiente para captar conversación local específica de Perote — en ese caso se evalúa activar Apify como capa adicional, no como sustituto.

---

## 3. Flujo operativo actualizado (Mes 1)

El flujo completo simplificado de la Especificación Técnica v2 se mantiene igual en su lógica editorial. Cambia únicamente el motor que ejecuta cada paso:

| Etapa | Acción | Motor (Mes 1) |
|---|---|---|
| Captura de idea | Voz/texto por WhatsApp o Telegram | Hermes Agent (transcripción vía skill de voz del Tool Gateway) |
| Registro en Notion | Alta automática en DB Ideas | Hermes Agent (skill/MCP Notion) |
| Análisis de contexto | Brief de tema + score de relevancia | MiniMax (Nous Portal) + Web Search del Tool Gateway |
| Decisión editorial | Aprobar / posponer / descartar | Humana (Emmanuel) |
| Producción del borrador | Nota, guion, copy, hilo | MiniMax como modelo primario; modelo premium del Portal si la pieza lo amerita |
| Generación de imagen | Ilustración cuando no hay foto | Tool Gateway (Nous Portal) |
| Narración / audio | Cápsulas, podcast | Tool Gateway (Nous Portal) |
| Revisión y aprobación | Validación factual y de tono | Humana (Emmanuel) |
| Publicación | Sitio + redes | WordPress/Webflow + Buffer/Later (o skill de Hermes si aplica) |
| Métricas | Vistas, interacción, UC | Notion (dashboard), actualización manual o vía skill en Mes 1 |

---

## 4. Costos estimados — Mes de pruebas

Cifras orientativas de referencia (julio 2026), a confirmar contra la cotización vigente al momento de suscribirse:

| Concepto | Estimado mensual (USD) | Notas |
|---|---|---|
| VPS (ya contratado, Hostinger) | $0 adicional | Reutiliza infraestructura existente |
| Nous Portal (plan de pago) | Por definir según tier elegido | Incluye modelos + Tool Gateway completo |
| Consumo de tokens MiniMax vía Portal | Bajo, cargo variable dentro del Portal | Tarifa por token muy inferior a contratar Claude/GPT directo |
| Modelo premium ocasional (revisión/branded content) | Marginal | Mismo Portal, sin suscripción aparte |
| Stack previo (Notion, WordPress, Buffer, dominio) | $45–65 (sin cambio vs. Especificación Técnica v2) | No se modifica |

El ahorro frente al esquema multi-API original viene de **no duplicar suscripciones** (Perplexity Pro + ElevenLabs + OpenAI + Claude API por separado) durante la fase de prueba, no necesariamente de que cada token individual sea más barato en todos los casos.

---

## 5. Criterios de salida del mes de pruebas

Al final del mes 1, se evalúa con datos reales de uso (no solo estimados) si:

1. La calidad editorial de MiniMax vía Portal es suficiente para el volumen de piezas/semana objetivo (ver métricas de la Especificación Técnica v2, sección 14).
2. El Web Search del Tool Gateway capta adecuadamente la conversación local de Perote, o si se requiere sumar Apify/Grok como capa adicional de social listening.
3. El costo real de Nous Portal + MiniMax se mantiene por debajo del escenario multi-API original.
4. Hermes Agent cubre satisfactoriamente la orquestación que antes se planeaba para OpenClaw, o si se requiere una capa de automatización adicional (Make) para tareas que Hermes no resuelva bien.

Con base en esos resultados se decide si el stack consolidado pasa a ser el definitivo para Fase 2 en adelante, o si se reincorpora parcialmente el esquema multi-proveedor de los documentos anteriores.

---

