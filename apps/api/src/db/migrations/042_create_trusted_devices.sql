-- "Confiar en este dispositivo" al verificar 2FA: salta el código en el próximo
-- login desde el mismo navegador durante 30 días. El token viaja hasheado en una
-- cookie propia (crea_admin_device) — igual que backup codes, nunca en claro en DB.
-- Revocable desde Configuración → Perfil (uno o todos).
CREATE TABLE IF NOT EXISTS trusted_devices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices (user_id);
