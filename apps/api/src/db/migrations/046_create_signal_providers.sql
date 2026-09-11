-- RADAR 2.0, Fase 2 (R2-11): registro de proveedores de señales externas
-- (POST /api/signals, R2-12). Auth de máquina, separada del JWT de usuario
-- del panel — mismo principio que telegram_updates/webhook (Telegram y el
-- panel ya conviven con dos sistemas de auth distintos hoy).
-- La API key cruda se genera una sola vez (al crear/rotar el proveedor) y
-- nunca se persiste: solo su hash (sha256 hex, mismo patrón que
-- trusted_devices.token_hash). trust sigue el mismo vocabulario que
-- radar_sources.trust — participa en applyTrustFromSources() igual que un
-- dominio de esa lista (R2-13).
CREATE TABLE IF NOT EXISTS signal_providers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  api_key_hash TEXT NOT NULL UNIQUE,
  trust TEXT NOT NULL DEFAULT 'medium'
    CHECK (trust IN ('high', 'medium', 'low')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
