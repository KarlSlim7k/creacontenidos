-- 2FA (TOTP): secret cifrado en apps/api/src/lib/totp-crypto.js (AES-256-GCM,
-- nunca en claro en DB), flag de activación, y códigos de respaldo hasheados con
-- bcrypt (igual que password_hash) para recuperar acceso si se pierde el
-- dispositivo con la app de autenticación. Disponible a los 4 roles.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_factor_secret TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB;
