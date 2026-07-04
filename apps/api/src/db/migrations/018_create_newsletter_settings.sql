-- Fila única de configuración del cron del newsletter (hora + activo/inactivo).
CREATE TABLE IF NOT EXISTS newsletter_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT false,
  send_hour SMALLINT NOT NULL DEFAULT 6,
  send_minute SMALLINT NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT newsletter_settings_singleton CHECK (id = 1)
);

INSERT INTO newsletter_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
