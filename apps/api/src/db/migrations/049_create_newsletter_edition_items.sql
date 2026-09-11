-- RADAR 2.0, Fase 5 (R2-30): trazabilidad edición ↔ tema ↔ análisis. Hasta
-- ahora newsletter_editions.content.topicsUsed era un NÚMERO, no una
-- referencia — esta tabla es la referencia real. Solo existe cuando hay
-- selección editorial explícita (R2-31); el camino legacy (cron/generación
-- automática sin selección) no escribe filas acá, y sigue funcionando igual.
CREATE TABLE IF NOT EXISTS newsletter_edition_items (
  id SERIAL PRIMARY KEY,
  edition_id INTEGER NOT NULL REFERENCES newsletter_editions(id),
  topic_id INTEGER REFERENCES topics(id),
  analysis_id INTEGER REFERENCES editorial_analyses(id),
  section TEXT NOT NULL,
  position SMALLINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_newsletter_edition_items_edition ON newsletter_edition_items (edition_id);
