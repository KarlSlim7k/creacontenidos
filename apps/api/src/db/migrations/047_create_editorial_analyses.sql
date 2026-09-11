-- RADAR 2.0, Fase 3 (R2-18): objeto editorial maestro. FK a topics, NO
-- ALTER TABLE topics — topics ya carga señal cruda + verificación + ficha
-- parcial (~24 columnas); esto es una responsabilidad nueva, tabla propia
-- (docs/implementaciones/radar2/01-feedback-editorial.md ya fija este
-- criterio para R2-05, se repite aquí). Sin UNIQUE(topic_id): un tema puede
-- tener 0, 1 o varios análisis — el más reciente (created_at) es el vigente.
-- Campos y niveles: docs/ia/motor-editorial-crea.md (R2-17).
CREATE TABLE IF NOT EXISTS editorial_analyses (
  id SERIAL PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  analysis_level SMALLINT NOT NULL CHECK (analysis_level IN (1, 2, 3)),
  que_paso JSONB,
  por_que_importa TEXT,
  contexto TEXT,
  datos JSONB,
  implicaciones JSONB,
  conversacion JSONB,
  pendientes TEXT,
  relevancia_perote TEXT,
  para_el_ciudadano TEXT,
  model TEXT,
  provider TEXT,
  tokens_used INTEGER,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_editorial_analyses_topic ON editorial_analyses (topic_id);
