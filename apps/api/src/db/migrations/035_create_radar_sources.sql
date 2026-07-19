-- Lista editorial de fuentes para RADAR (trust high|medium|low).
-- Plan: docs/ia/radar-verificacion-plan.md Fase 4 / PR5.
-- Al detectar: evidence.url que matchee domain high → bonus; low → malus.

CREATE TABLE IF NOT EXISTS radar_sources (
  id SERIAL PRIMARY KEY,
  domain TEXT NOT NULL,
  label TEXT NOT NULL,
  trust TEXT NOT NULL DEFAULT 'medium'
    CHECK (trust IN ('high', 'medium', 'low')),
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT radar_sources_domain_unique UNIQUE (domain)
);

-- Semilla local Perote / regional (idempotente)
INSERT INTO radar_sources (domain, label, trust, notes)
SELECT v.domain, v.label, v.trust, v.notes
FROM (VALUES
  ('perote.gob.mx', 'Ayuntamiento de Perote', 'high', 'Fuente primaria municipal'),
  ('veracruz.gob.mx', 'Gobierno del Estado de Veracruz', 'high', 'Fuente primaria estatal'),
  ('gob.mx', 'Gobierno de México', 'high', 'Dominio raíz de sitios oficiales federales'),
  ('imss.gob.mx', 'IMSS', 'high', NULL),
  ('cfe.mx', 'CFE', 'medium', NULL),
  ('facebook.com', 'Facebook (red social)', 'low', 'Viralidad ≠ verificación'),
  ('tiktok.com', 'TikTok', 'low', 'Requiere corroboración independiente'),
  ('x.com', 'X / Twitter', 'low', NULL),
  ('twitter.com', 'Twitter (legacy)', 'low', NULL)
) AS v(domain, label, trust, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM radar_sources r WHERE lower(r.domain) = lower(v.domain)
);
