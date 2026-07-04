-- Pipeline del panel admin: topics → 'propuesta' → 'borrador' → 'en_revision' →
-- 'published' (gate editorial, ya usado por el sitio público) | 'rechazada'.
-- `format` ya existía (003_create_content_proposals.sql).
ALTER TABLE content_proposals
  ADD COLUMN IF NOT EXISTS angulo TEXT,
  ADD COLUMN IF NOT EXISTS sensibilidad TEXT,
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_comment TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
