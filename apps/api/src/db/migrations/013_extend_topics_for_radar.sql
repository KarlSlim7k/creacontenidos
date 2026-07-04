-- Ficha de contexto de RADAR (pantalla de social listening del panel admin).
ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS antecedentes TEXT,
  ADD COLUMN IF NOT EXISTS actores TEXT,
  ADD COLUMN IF NOT EXISTS angulos TEXT,
  ADD COLUMN IF NOT EXISTS audiencia TEXT;
