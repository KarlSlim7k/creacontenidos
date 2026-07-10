-- Restringe content_proposals.section a la taxonomía fija (lib/sections.js).
-- NOT VALID: no revalida filas ya existentes (pueden traer secciones libres
-- de antes de esta migración) — solo aplica a INSERT/UPDATE nuevos. La app ya
-- valida antes de llegar acá (editorial draft PATCH, prompt de
-- generateProposal); esto es el backstop a nivel de datos.
ALTER TABLE content_proposals
  ADD CONSTRAINT content_proposals_section_check
  CHECK (section IS NULL OR section IN ('Local', 'Cultura', 'Economía', 'Entretenimiento', 'Deportes', 'Opinión'))
  NOT VALID;
