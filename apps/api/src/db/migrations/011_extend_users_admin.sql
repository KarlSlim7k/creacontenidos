-- Panel admin: activar/desactivar usuarios desde Configuración.
-- Valores válidos de `role` (ya existía, TEXT libre): director, produccion, comercial, colaborador.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
