-- Borrar un topic de RADAR (señal efímera) no debe bloquearse ni arrastrar
-- las content_proposals ya generadas a partir de él — quedan con topic_id NULL.
ALTER TABLE content_proposals DROP CONSTRAINT content_proposals_topic_id_fkey;
ALTER TABLE content_proposals ADD CONSTRAINT content_proposals_topic_id_fkey
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE SET NULL;
