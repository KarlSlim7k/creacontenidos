-- Seed dev: los 5 paquetes que traía el mockup estático de servicios.html.
-- Solo si la tabla está vacía (no hay slug/unique para ON CONFLICT — el admin ya
-- puede editarlos vía panel, así que reinsertar en cada seed pisaría cambios reales).
INSERT INTO service_packages (name, price_label, description, features, cta_interest, sort_order)
SELECT * FROM (VALUES
  ('Patrocinio de sección mensual', '$2,500–$5,000 MXN/mes',
   'Tu marca asociada de forma continua a una sección editorial específica.',
   '["Mención fija en la franja de sección", "Logo en la página de sección", "Reporte mensual de desempeño"]'::jsonb,
   'Patrocinio de sección', 1),
  ('Branded content básico', '$1,500–$3,000 MXN/pieza',
   'Una nota patrocinada redactada por el equipo editorial de CREA.',
   '["1 nota de 500–700 palabras", "1 imagen principal", "Difusión en redes de CREA"]'::jsonb,
   'Branded content', 2),
  ('Branded content premium', '$4,000–$8,000 MXN',
   'Nota + video + hilo en redes — producción completa de la pieza.',
   '["Nota + video corto", "Hilo de redes sociales", "Difusión destacada en home"]'::jsonb,
   'Branded content', 3),
  ('Cobertura de evento', '$3,000–$6,000 MXN',
   'Cobertura editorial y fotográfica de tu evento o inauguración.',
   '["Reportero y fotógrafo en sitio", "Nota de cobertura", "Galería de fotos"]'::jsonb,
   'Otro', 4),
  ('Publicidad display mensual', '$800–$1,500 MXN/mes',
   'Espacio publicitario medido dentro de crearcontenidos.com.',
   '["Espacio fijo en home o sección", "Reporte de impresiones", "Sin compromiso de permanencia"]'::jsonb,
   'Publicidad display', 5)
) AS v(name, price_label, description, features, cta_interest, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM service_packages);
