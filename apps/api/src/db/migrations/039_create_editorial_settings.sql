-- Fila única de configuración editorial global. default_directive precarga el
-- campo de directriz por-nota (editable/override en cada propuesta) cuando esta
-- no trae una propia. Patrón singleton igual a newsletter_settings.
CREATE TABLE IF NOT EXISTS editorial_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  default_directive TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT editorial_settings_singleton CHECK (id = 1)
);

INSERT INTO editorial_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
