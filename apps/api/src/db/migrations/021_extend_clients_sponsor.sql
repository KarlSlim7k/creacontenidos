-- Datos reales para patrocinar el newsletter: sin esto, el "patrocinador"
-- nunca se automatiza (no hay copy/link real que la IA pueda inventar).
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_copy TEXT,
  ADD COLUMN IF NOT EXISTS last_sponsored_at TIMESTAMPTZ;
