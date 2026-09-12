-- R2-56 (fase 09): el seed histórico de 031 son medios regionales de Xalapa,
-- no las páginas hiperlocales de Perote que pide el piloto "Buenos días, Perote".
-- Solo datos, sin cambio de esquema.
--
-- Se desactiva el seed histórico en vez de borrarlo (puede seguir usándose para
-- competencia regional en otro flujo) y se agrega el catálogo de Perote.
--
-- Los 4 handles de abajo se ubicaron por búsqueda web (sep 2026), NO visitando
-- la página con sesión — no hay confirmación real de que sean públicas ni de
-- que sean la cuenta oficial correcta. Por eso las 4 quedan active=false: un
-- editor debe confirmarlas a mano (Configuración → Cuentas FB) antes de activar
-- cualquiera. "La Voz del Cofre" no se pudo ubicar en absoluto — se deja fuera
-- del seed; agregarla a mano si se encuentra.

UPDATE competitor_facebook_accounts
SET active = false
WHERE handle_or_url IN ('DiarioDeXalapa', 'AVCNoticias', 'ElDictamenVer');

INSERT INTO competitor_facebook_accounts (label, handle_or_url, active, priority)
SELECT v.label, v.handle_or_url, false, v.priority
FROM (VALUES
  ('Perote Noticias', 'NoticiasPerote', 10),
  ('Perote al Momento', 'perotealmomento', 10),
  ('La Voz del Pinahuizapan', '61582314420436', 5)
) AS v(label, handle_or_url, priority)
WHERE NOT EXISTS (
  SELECT 1 FROM competitor_facebook_accounts f WHERE lower(f.handle_or_url) = lower(v.handle_or_url)
);
