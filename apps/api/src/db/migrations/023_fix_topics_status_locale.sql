-- RADAR (panel admin) filtra y pinta el badge de estado comparando contra
-- 'Nuevo'/'Revisado' (ver renderRadar() en panel.js), pero la columna traía
-- el default original en inglés ('new') de 002_create_topics.sql — los topics
-- detectados nunca hacían match con los chips de filtro ni con el estilo del badge.
ALTER TABLE topics ALTER COLUMN status SET DEFAULT 'Nuevo';

UPDATE topics SET status = 'Nuevo' WHERE status = 'new';
UPDATE topics SET status = 'Revisado' WHERE status = 'reviewed';
