-- RADAR verificación editorial (docs/ia/radar-verificacion-plan.md, Fase 1).
-- Campos de confianza/evidencia; independientes de status workflow (Nuevo/Revisado).
-- Topics legacy quedan con confidence/verification_status NULL (= sin evaluar).

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS confidence SMALLINT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT,
  ADD COLUMN IF NOT EXISTS known_facts TEXT,
  ADD COLUMN IF NOT EXISTS unknown_facts TEXT,
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS editorial_decision TEXT,
  ADD COLUMN IF NOT EXISTS source_count SMALLINT;

ALTER TABLE topics
  DROP CONSTRAINT IF EXISTS topics_confidence_range;
ALTER TABLE topics
  ADD CONSTRAINT topics_confidence_range
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100));

ALTER TABLE topics
  DROP CONSTRAINT IF EXISTS topics_verification_status_check;
ALTER TABLE topics
  ADD CONSTRAINT topics_verification_status_check
  CHECK (
    verification_status IS NULL
    OR verification_status IN ('verified', 'checking', 'signal', 'risk')
  );
