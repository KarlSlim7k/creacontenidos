-- RADAR 2.0, Fase 1 (R2-05): taxonomía de motivos para rechazo/devolución
-- editorial. Sin CHECK rígido a propósito — la taxonomía (lib/editorial-reasons.js)
-- puede ajustarse sin migración; se valida en la capa de aplicación, igual que ya
-- se hace con SECTIONS en modules/editorial/index.js. review_comment (texto
-- libre) no se reemplaza: ambos coexisten, este es un campo adicional.
ALTER TABLE content_proposals
  ADD COLUMN IF NOT EXISTS review_reason_code TEXT;
