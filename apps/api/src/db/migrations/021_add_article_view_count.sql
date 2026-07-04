-- "Lo más leído" real: contador simple por nota, incrementado desde
-- POST /api/public/articles/:slug/view (ver nota.html). Sin tabla de eventos:
-- para un sitio de este tamaño un contador basta y evita una tabla que crece sin fin.
ALTER TABLE content_proposals
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS content_proposals_most_read_idx
  ON content_proposals (view_count DESC)
  WHERE status = 'published';
