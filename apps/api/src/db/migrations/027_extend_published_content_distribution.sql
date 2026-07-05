-- published_content (004) nunca tuvo endpoints; se revive como bitácora de la capa
-- de distribución (push a Facebook/WhatsApp/WordPress tras publicar en el sitio).
ALTER TABLE published_content
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS detail TEXT,
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
