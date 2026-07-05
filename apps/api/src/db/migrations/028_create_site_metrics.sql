-- Métricas de audiencia de Estudio, hoy copiadas a mano en 3 páginas HTML
-- (estudio/index.html, media-kit.html, tercer-tiempo.html). Fila única
-- (singleton, mismo patrón que newsletter_settings), editable en Configuración.
CREATE TABLE IF NOT EXISTS site_metrics (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  monthly_reach_label TEXT NOT NULL DEFAULT '42K',
  municipalities_count INTEGER NOT NULL DEFAULT 3,
  tercer_tiempo_listeners_label TEXT NOT NULL DEFAULT '+1K',
  audience_age_18_24_pct INTEGER NOT NULL DEFAULT 27,
  audience_age_25_44_pct INTEGER NOT NULL DEFAULT 48,
  audience_age_45_plus_pct INTEGER NOT NULL DEFAULT 25,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO site_metrics (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
