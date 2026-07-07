-- Imágenes de portada generadas con IA (OpenRouter devuelve base64, no URL pública).
-- Se guardan en Postgres en tabla propia — nunca en content_proposals — para que los
-- SELECT de listados no arrastren megas de binario. Se sirven vía
-- GET /api/public/images/:id y cover_image_url guarda esa ruta relativa.
CREATE TABLE IF NOT EXISTS generated_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id INTEGER REFERENCES content_proposals(id) ON DELETE SET NULL,
  prompt TEXT,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
