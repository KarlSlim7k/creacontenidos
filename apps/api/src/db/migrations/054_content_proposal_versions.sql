-- RADAR 2.0, backlog nuevo (auditoría §22-23, R2-50 + R2-59): historial de
-- versiones de una content_proposals. Dos usos comparten la misma tabla en
-- vez de dos tablas paralelas:
--   'ai_generated' — snapshot del cuerpo justo cuando lo escribió la IA
--                    (generate-proposal / generate-draft), ANTES de la
--                    edición humana. Sirve para medir "corrección humana"
--                    (R2-50: % del texto que el equipo cambió).
--   'human_save'   — snapshot en cada "Guardar borrador" explícito del
--                    editor (R2-59: historial mínimo de versiones en el
--                    panel). El autosave del navegador (recarga accidental)
--                    es solo local (localStorage), nunca toca esta tabla.
-- FK a content_proposals, no ALTER TABLE content_proposals — mismo criterio
-- que editorial_analyses/content_renders: una responsabilidad nueva, tabla propia.
CREATE TABLE IF NOT EXISTS content_proposal_versions (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER NOT NULL REFERENCES content_proposals(id),
  source TEXT NOT NULL CHECK (source IN ('ai_generated', 'human_save')),
  title TEXT,
  body TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_proposal_versions_proposal
  ON content_proposal_versions (proposal_id, created_at DESC);
