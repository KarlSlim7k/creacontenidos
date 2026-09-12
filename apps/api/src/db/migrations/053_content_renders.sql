-- RADAR 2.0, Fase 6 (R2-37): renders por canal de una content_proposals,
-- generalizando el patrón de newsletter_editions.content a piezas fuera del
-- newsletter. Tabla propia con FK a content_proposals, NO ALTER TABLE
-- content_proposals — mismo criterio que editorial_analyses (fase 3): una
-- responsabilidad nueva, no más columnas en la tabla que ya tiene ~20.
--
-- analysis_id + analysis_created_at (el "o timestamp" que permite R2-37 en
-- vez de una columna de versión propia) guardan de qué análisis salió el
-- render: si editorial_analyses tiene una fila más nueva para el mismo tema,
-- el render queda desactualizado (se calcula al leer, no se marca aparte).
-- Sin UNIQUE(proposal_id, channel): cada regeneración es una fila nueva
-- (auditable, igual que editorial_analyses), la vigente es la más reciente.
CREATE TABLE IF NOT EXISTS content_renders (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES content_proposals(id),
  channel TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp', 'audio', 'social')),
  content JSONB NOT NULL,
  analysis_id INTEGER REFERENCES editorial_analyses(id),
  analysis_created_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_renders_proposal_channel
  ON content_renders (proposal_id, channel, created_at DESC);
