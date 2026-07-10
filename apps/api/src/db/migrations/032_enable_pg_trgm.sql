-- Habilita similarity() (trigramas) usado para: 1) detectar canibalización —
-- content-engine/generate-proposal compara el topic contra títulos ya
-- publicados ANTES de gastar en generación —, y 2) traer contexto de
-- competencia (competitor_posts) para diferenciar ángulo sin copiar. Ambos
-- se resuelven con datos que ya vivían en la base, sin pagar un SERP externo.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
