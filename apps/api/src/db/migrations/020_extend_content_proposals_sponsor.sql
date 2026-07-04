-- Contenido patrocinado del portal público (index.html "Aliados de CREA" y
-- patrocinado.html). Reusa content_proposals en vez de una tabla aparte: un
-- patrocinado es una nota normal con estas dos columnas encima.
ALTER TABLE content_proposals
  ADD COLUMN IF NOT EXISTS is_sponsored BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sponsor_name TEXT;

CREATE INDEX IF NOT EXISTS content_proposals_sponsored_idx
  ON content_proposals (is_sponsored, published_at DESC)
  WHERE is_sponsored = true;
