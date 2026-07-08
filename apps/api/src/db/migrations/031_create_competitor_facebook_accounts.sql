-- Cuentas de Facebook para el scraper de competencia (Configuración → Cuentas FB).
-- Reemplaza la constante DEFAULT_FACEBOOK_ACCOUNTS hardcodeada en listening/index.js.
CREATE TABLE IF NOT EXISTS competitor_facebook_accounts (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  handle_or_url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO competitor_facebook_accounts (label, handle_or_url) VALUES
  ('Diario de Xalapa', 'DiarioDeXalapa'),
  ('AVC Noticias', 'AVCNoticias'),
  ('El Dictamen', 'ElDictamenVer');
