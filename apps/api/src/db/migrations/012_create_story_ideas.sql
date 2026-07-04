-- Bandeja de ideas de reporteros/colaboradores. Distinta de `topics` (detección de
-- listening con menciones/sentimiento): aquí el origen es un humano proponiendo una nota.
CREATE TABLE IF NOT EXISTS story_ideas (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  description TEXT,
  score NUMERIC(3,1),
  collaborator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  column_status TEXT NOT NULL DEFAULT 'nueva',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
