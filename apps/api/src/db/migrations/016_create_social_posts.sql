-- Producciones CREA: contenido embebido desde redes sociales (TikTok hoy; YouTube/Facebook
-- cuando se aprueben sus APIs). La idea: el editor guarda la URL en el panel admin, el
-- backend resuelve el embed vía oEmbed del proveedor y persiste el HTML ya listo; el sitio
-- público nunca llama a TikTok/YouTube directamente — si la red cae, los embeds viejos
-- siguen sirviendo.
CREATE TABLE IF NOT EXISTS social_posts (
  id SERIAL PRIMARY KEY,
  network TEXT NOT NULL,
  external_url TEXT NOT NULL UNIQUE,
  title TEXT,
  author_name TEXT,
  thumbnail_url TEXT,
  embed_html TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fetched_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_social_posts_feed
  ON social_posts (is_published, position, created_at DESC)
  WHERE is_published = true;
