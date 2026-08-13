-- Invalida JWT emitidos antes de un logout/cambio de credenciales sin mantener
-- una tabla de sesiones. El middleware compara este valor con el claim `sv`.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
