-- Catálogo comercial mostrado en apps/web/estudio/servicios.html. Antes vivía
-- hardcodeado en el HTML; ahora es editable desde el panel admin (Configuración →
-- Servicios, solo Director) y el sitio público lo lee vía GET /api/public/services.
CREATE TABLE IF NOT EXISTS service_packages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price_label TEXT NOT NULL,
  description TEXT NOT NULL,
  features JSONB NOT NULL DEFAULT '[]',
  cta_interest TEXT NOT NULL DEFAULT 'Otro',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_packages_public_idx
  ON service_packages (active, sort_order);
