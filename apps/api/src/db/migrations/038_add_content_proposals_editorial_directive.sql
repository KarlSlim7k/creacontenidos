-- Directriz editorial por nota: instrucción libre del editor que se antepone al
-- prompt de generación (generateProposal y generateDraft en ai-client.js), antes
-- de que la IA redacte título/cuerpo. Se guarda al crear la propuesta desde RADAR
-- y persiste con la pieza a través del pipeline.
ALTER TABLE content_proposals
  ADD COLUMN IF NOT EXISTS editorial_directive TEXT;
