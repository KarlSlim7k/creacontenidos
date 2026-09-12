-- Salud de radar_sources (R2-52, fase 09). Migración aditiva: filas existentes
-- quedan con status='ok' por defecto (no hay señal de fallo previa que registrar).
-- Ver docs/implementaciones/radar2/09-catalogo-fuentes-salud.md

ALTER TABLE radar_sources ADD COLUMN IF NOT EXISTS last_crawl_at TIMESTAMPTZ;
ALTER TABLE radar_sources ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE radar_sources ADD COLUMN IF NOT EXISTS engine TEXT;
ALTER TABLE radar_sources ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'radar_sources_status_check'
  ) THEN
    ALTER TABLE radar_sources ADD CONSTRAINT radar_sources_status_check
      CHECK (status IN ('ok', 'stale', 'error'));
  END IF;
END $$;
