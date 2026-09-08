# Fase 5 — Buenos días, Perote (punto 14) — cierre del MVP

> Depende de: `03-motor-editorial.md`, `04-crea-score.md` · Es el cierre del recorrido de punta a
> punta del MVP · Prioridad: **P0**

## Punto de partida importante: esto ya funciona, no se reconstruye

**RADAR ya alimenta el boletín.** `generateContent()` (`lib/newsletter-content.js:43-51`):

```sql
SELECT title, sentiment, antecedentes, angulos FROM topics
WHERE detected_at >= now() - interval '48 hours'
  AND (verification_status IS NULL OR verification_status <> 'risk')
ORDER BY COALESCE(confidence, 0) DESC, mentions DESC
LIMIT 5
```

Ya excluye temas de riesgo y ya prioriza (mal, con `confidence`+`mentions`, no con el CREA Score
que ahora existe). Generación, edición, clima real, agenda, patrocinador, audio, claim atómico de
envío, cron y pipeline — **todo eso se conserva sin tocar**. Ver la lista completa de "no tocar" en
el README de este directorio.

## Las tres brechas reales (y solo esas tres)

1. **El editor no selecciona.** Hoy la selección la hace un `ORDER BY ... LIMIT 5`. El editor
   puede reescribir el texto resultante, pero no puede decir "estos tres sí, este va en MUNDO".
2. **Sin trazabilidad edición ↔ tema ↔ nota.** `newsletter_editions.content` guarda `topicsUsed`
   como un **número**, no como referencias.
3. **El boletín es una rama paralela.** Lee `topics` directo y nunca toca `content_proposals`. Una
   nota web y un ítem de boletín sobre el mismo hecho son dos textos sin relación en la base.

## Tareas

### R2-30 — Tabla puente de trazabilidad

- **Módulo:** `api/db`
- **Archivo:** `apps/api/src/db/migrations/0NN_newsletter_edition_items.sql` *(nuevo)*
- **Hacer:**
  ```sql
  CREATE TABLE IF NOT EXISTS newsletter_edition_items (
    id SERIAL PRIMARY KEY,
    edition_id INTEGER NOT NULL REFERENCES newsletter_editions(id),
    topic_id INTEGER REFERENCES topics(id),
    analysis_id INTEGER REFERENCES editorial_analyses(id),
    section TEXT NOT NULL,
    position SMALLINT NOT NULL
  );
  ```
- **Criterio de aceptación:** cada ítem de una edición referencia su tema de origen y, si existe,
  su análisis.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-31 — Selección editorial en vez de `ORDER BY ... LIMIT 5`

- **Módulo:** `api/newsletter`
- **Archivos:** `lib/newsletter-content.js:43-77`, `modules/newsletter/index.js:41`
- **Hacer:** `generateContent(selection)` acepta una selección explícita del editor (lista de
  `topic_id` con su sección). **Si no recibe ninguna selección, conserva el comportamiento actual
  exacto** — así el cron cada minuto (`newsletter-cron.js`) sigue funcionando sin romperse mientras
  se adopta el flujo nuevo. Esto es la regla de "compatibilidad hacia atrás sin flags" del README.
- **Criterio de aceptación:** con selección explícita, el boletín usa exactamente esos temas en
  esas secciones; sin selección, es indistinguible del comportamiento de hoy.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-32 — Secciones del boletín

- **Módulo:** `api/newsletter`
- **Archivos:** `lib/newsletter-content.js`, `lib/newsletter-template.js`
- **Hacer:** PEROTE / VERACRUZ-MÉXICO / MUNDO / ECO-TEC-CULT-DEP / PARA ENTENDER. **Las secciones
  vacías simplemente no se renderizan** — la relevancia manda sobre la cantidad, no hay obligación
  de llenar las 5.
- **Criterio de aceptación:** una edición con 3 secciones llenas y 2 vacías se ve completa, no
  rota.
- **Clasificación:** REQUIERE DESARROLLO. Prioridad P1 (depende de `territorial_scope` de la fase
  `02` para clasificar automáticamente; sin eso, la sección la asigna el editor a mano en `R2-33`).

### R2-33 — Panel: pantalla de selección matutina

- **Módulo:** `admin`
- **Archivos:** `apps/admin/src/screens/hermes.ts` (pestaña "Edición de hoy"), `actions.ts`
- **Hacer:** RADAR propone los N temas mejor puntuados (CREA Score), el editor marca los que
  entran y les asigna sección; el editor puede abrir la ficha del tema antes de decidir. Al
  confirmar, llama a `generateContent(selection)` de `R2-31`.
- **Criterio de aceptación:** un editor puede producir una edición completa sin tocar la base de
  datos ni el código.
- **Clasificación:** REQUIERE DESARROLLO.

### R2-34 — "PARA ENTENDER" desde un análisis nivel 3

- **Módulo:** `api/newsletter`
- **Archivos:** `lib/newsletter-content.js`, `lib/editorial-engine.js` (de la fase `03`)
- **Hacer:** la sección se llena **solo si** hay un análisis nivel 3 aprobado para alguno de los
  temas seleccionados. Si no lo hay, la sección no aparece — no se rellena con un resumen más
  largo del tema.
- **Criterio de aceptación:** "PARA ENTENDER" nunca es un tema de nivel 1/2 disfrazado.
- **Clasificación:** REQUIERE DESARROLLO. Prioridad P1.

### R2-35 — Checks del boletín ampliados

- **Módulo:** `api/tests`
- **Archivo:** `apps/api/scripts/check-newsletter.js` *(existente, extender)*
- **Hacer:** cubrir selección explícita, fallback sin selección (debe producir exactamente lo de
  hoy — **es la prueba de no-regresión del cron**), y trazabilidad de ítems.
- **Criterio de aceptación:** `generateContent()` sin selección produce lo mismo que antes de esta
  fase, verificado con un test, no solo revisado a ojo.
- **Clasificación:** AJUSTE MENOR.

## Qué NO hacer

- No tocar el claim atómico de envío (`modules/newsletter/index.js:107-120`) ni la lógica de audio,
  clima real, agenda o patrocinador — nada de eso cambia en esta fase.
- No obligar a llenar las 5 secciones.
- No dejar que el cron minuto a minuto dispare la selección — la selección siempre es un paso
  humano; el cron solo genera cuando ya existe una selección (o, en su ausencia, sigue con el
  comportamiento legacy).

## Verificación

```bash
cd apps/api
node scripts/run-checks.js unit
node scripts/check-newsletter.js
cd ../admin && npx tsc --noEmit && npm test && npm run build
```

Prueba manual: generar una edición sin selección explícita y confirmar que el HTML/texto/guion
producidos son idénticos a los de antes de esta fase (no-regresión del cron).

## Con esto se cierra el MVP

El recorrido `DETECCIÓN EXTERNA (02) → VERIFICACIÓN (existente) → MOTOR EDITORIAL (03) → CREA
SCORE (04) → APROBACIÓN HUMANA (existente) → BUENOS DÍAS, PEROTE (05)` queda funcional de punta a
punta. Ver `docs/auditorias/RADAR-2.0-AUDITORIA.md` §21 para el checklist completo de validación
del MVP (técnico, editorial y operativo) antes de darlo por cerrado.
