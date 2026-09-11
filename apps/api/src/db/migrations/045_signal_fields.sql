-- RADAR 2.0, Fase 2 (R2-10): campos de señal externa en `topics`.
-- 6 de los 17 campos del contrato (docs/ia/contrato-senales-externas.md,
-- R2-03) ya existen (title, detectedAt→detected_at, confidence,
-- factualSummary→known_facts, corroboratingSources→evidence/source_count,
-- verificationStatus→verification_status). Estos son los que faltaban.
-- Filas legacy quedan con todo NULL: ningún caller existente los provee.
ALTER TABLE topics ADD COLUMN IF NOT EXISTS event_date TIMESTAMPTZ;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS locality TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS territorial_scope TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS media_available BOOLEAN;

-- Clave de idempotencia de POST /api/signals (R2-12): reenviar el mismo
-- (provider, external_id) no debe crear una fila nueva. Parcial: no aplica
-- a los caminos de detección internos (Firecrawl/Perplexity/Facebook), que
-- nunca traen external_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_topics_provider_external_id
  ON topics (provider, external_id) WHERE external_id IS NOT NULL;
