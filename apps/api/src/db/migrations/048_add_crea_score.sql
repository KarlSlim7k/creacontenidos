-- RADAR 2.0, Fase 4 (R2-26): CREA Score persistido en topics. NULL = sin
-- calcular todavía o sin ningún factor disponible (nunca 0 por defecto: 0 es
-- un score real y bajo, no "no hay dato"). El desglose no es opcional — sin
-- él el score no es auditable por el editor (docs/ia/crea-score.md, R2-24).
ALTER TABLE topics ADD COLUMN IF NOT EXISTS crea_score SMALLINT CHECK (crea_score BETWEEN 0 AND 100);
ALTER TABLE topics ADD COLUMN IF NOT EXISTS crea_score_breakdown JSONB;
