-- Fase 3: leads del formulario de contacto de Estudio (POST /api/public/leads).
-- Tabla de escritura pública (sin auth): validación y rate limit viven en la frontera del router.
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  service_interest TEXT,
  message TEXT NOT NULL,
  source_page TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
