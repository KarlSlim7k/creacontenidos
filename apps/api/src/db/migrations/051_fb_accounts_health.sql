-- Salud + checkpoint de competitor_facebook_accounts (R2-53, fase 09). Aditiva:
-- analyze_comments queda en false para todas las filas existentes — activar el
-- análisis de comentarios requiere que 08-conversacion-digital.md (R2-44/R2-45)
-- resuelva primero la adquisición. Ver docs/implementaciones/radar2/09-catalogo-fuentes-salud.md

ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'facebook';
ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS priority SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS analyze_comments BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS last_scan_at TIMESTAMPTZ;
ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS access_status TEXT;
ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE competitor_facebook_accounts ADD COLUMN IF NOT EXISTS checkpoint TEXT;

-- Mismo vocabulario que radar_sources.status (R2-52): ok/stale/error. Nullable
-- porque una cuenta recién creada aún no tiene ningún corte que reportar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fb_accounts_access_status_check'
  ) THEN
    ALTER TABLE competitor_facebook_accounts ADD CONSTRAINT fb_accounts_access_status_check
      CHECK (access_status IS NULL OR access_status IN ('ok', 'stale', 'error'));
  END IF;
END $$;
