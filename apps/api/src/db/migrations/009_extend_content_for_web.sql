-- Fase 0: forma canónica del artículo publicado en el sitio.
-- content_proposals.status = 'published' + published_at = visible en el portal.
ALTER TABLE content_proposals
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS dek TEXT,
  ADD COLUMN IF NOT EXISTS author_name TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Único en slug (índice único: soporta ON CONFLICT (slug) en seeds).
CREATE UNIQUE INDEX IF NOT EXISTS content_proposals_slug_key
  ON content_proposals (slug);

-- Listados públicos: portada/sección ordenados por fecha de publicación.
CREATE INDEX IF NOT EXISTS content_proposals_web_list_idx
  ON content_proposals (status, section, published_at DESC);
