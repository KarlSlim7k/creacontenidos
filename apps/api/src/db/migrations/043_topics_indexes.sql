-- RADAR 2.0, Fase 0 (R2-01): índices en `topics` antes de abrir la ingesta
-- externa (fase 2). Hoy `findRecentSimilarTopic()` (lib/topic-detection.js)
-- hace `similarity(title, $1)` sobre la ventana de 24h en Seq Scan — no
-- escala cuando entren señales externas además del cron actual.
-- pg_trgm ya está habilitado (migration 032); el índice GIN lo aprovecha
-- para similarity()/ILIKE. El índice sobre detected_at acelera el filtro de
-- ventana (`WHERE detected_at >= now() - interval '24 hours'`) y el ORDER BY
-- por fecha que ya usa el resto de RADAR.
CREATE INDEX IF NOT EXISTS idx_topics_detected_at ON topics (detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_topics_title_trgm ON topics USING GIN (title gin_trgm_ops);
