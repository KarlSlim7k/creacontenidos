-- GET /api/public/authors/:name/articles filtra por author_name sobre notas
-- publicadas. Los índices existentes son (status, section, published_at) y
-- (view_count) — ninguno sirve para este filtro, así que hoy hace scan filtrado.
-- A la escala actual (decenas de notas) es irrelevante; el índice parcial es
-- barato y evita el scan cuando el catálogo crezca.
CREATE INDEX IF NOT EXISTS idx_content_proposals_author_published
  ON content_proposals (author_name)
  WHERE status = 'published';
