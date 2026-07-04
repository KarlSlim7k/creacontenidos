-- Panel admin: usuarios de los 4 roles + datos de ejemplo del pipeline editorial y comercial.
-- Password de dev para todos: "crea2026" (bcrypt, cost 10). Solo para desarrollo local.

INSERT INTO users (name, email, password_hash, role, active)
SELECT v.name, v.email, v.password_hash, v.role, v.active::boolean
FROM (VALUES
  ('Mariana Cobos', 'director@crearcontenidos.com', '$2b$10$g3ubKCDcsuo18Lm/ktS2XeN.8T1zScn2M64E7UWFSGpmSdWo4D93y', 'director', 'true'),
  ('Carlos Mendoza', 'carlos.mendoza@crearcontenidos.com', '$2b$10$g3ubKCDcsuo18Lm/ktS2XeN.8T1zScn2M64E7UWFSGpmSdWo4D93y', 'produccion', 'true'),
  ('Ana Torres', 'ana.torres@crearcontenidos.com', '$2b$10$g3ubKCDcsuo18Lm/ktS2XeN.8T1zScn2M64E7UWFSGpmSdWo4D93y', 'produccion', 'true'),
  ('Luisa Pérez', 'luisa.perez@crearcontenidos.com', '$2b$10$g3ubKCDcsuo18Lm/ktS2XeN.8T1zScn2M64E7UWFSGpmSdWo4D93y', 'produccion', 'false'),
  ('Equipo comercial', 'comercial@crearcontenidos.com', '$2b$10$g3ubKCDcsuo18Lm/ktS2XeN.8T1zScn2M64E7UWFSGpmSdWo4D93y', 'comercial', 'true'),
  ('Marisol Hidalgo', 'marisol.hidalgo@crearcontenidos.com', '$2b$10$g3ubKCDcsuo18Lm/ktS2XeN.8T1zScn2M64E7UWFSGpmSdWo4D93y', 'colaborador', 'true'),
  ('Tomás Ibarra', 'tomas.ibarra@crearcontenidos.com', '$2b$10$g3ubKCDcsuo18Lm/ktS2XeN.8T1zScn2M64E7UWFSGpmSdWo4D93y', 'colaborador', 'true')
) AS v(name, email, password_hash, role, active)
ON CONFLICT (email) DO NOTHING;

-- Bandeja de ideas (colaboradores/reporteros)
INSERT INTO story_ideas (title, category, description, score, collaborator_id, column_status)
SELECT v.title, v.category, v.description, v.score, u.id, v.column_status
FROM (VALUES
  ('Vecinos proponen mercado nocturno de invierno', 'Local', 'Propuesta vecinal para un tianguis nocturno los fines de semana de invierno.', 8.2, 'tomas.ibarra@crearcontenidos.com', 'nueva'),
  ('Historia oral de los fundadores del Fuerte de San Carlos', 'Cultura', 'Serie de entrevistas con descendientes de las familias fundadoras.', 7.5, 'ana.torres@crearcontenidos.com', 'nueva'),
  ('Tres ideas de negocio que nacieron en el mercado municipal', 'Economía', 'Perfiles breves de emprendedores locales.', 6.8, 'marisol.hidalgo@crearcontenidos.com', 'nueva'),
  ('Reportaje sobre el precio de la papa en la región', 'Economía', 'Cobertura del ciclo de precios de la papa y su impacto en productores.', 9.1, 'carlos.mendoza@crearcontenidos.com', 'en_analisis'),
  ('Perfil de la nueva generación de productores agrícolas', 'Economía', 'Retrato de jóvenes agricultores que retoman tierras familiares.', 8.6, 'marisol.hidalgo@crearcontenidos.com', 'en_analisis'),
  ('Cobertura de la final regional de basquetbol', 'Deportes', 'Cobertura del equipo local en la final regional.', 8.9, 'ana.torres@crearcontenidos.com', 'aprobada'),
  ('Especial de aniversario del Fuerte de San Carlos', 'Cultura', 'Especial conmemorativo con línea de tiempo del fuerte.', 7.8, 'tomas.ibarra@crearcontenidos.com', 'aprobada'),
  ('Cobertura de feria comercial fuera de la zona de cobertura', 'Economía', 'Feria en municipio vecino, fuera del área editorial de CREA.', 4.2, 'tomas.ibarra@crearcontenidos.com', 'descartada')
) AS v(title, category, description, score, email, column_status)
JOIN users u ON u.email = v.email
WHERE NOT EXISTS (SELECT 1 FROM story_ideas si WHERE si.title = v.title);

-- Ficha de contexto para RADAR (temas detectados por listening)
INSERT INTO topics (title, source, mentions, sentiment, status, antecedentes, actores, angulos, audiencia)
SELECT v.title, v.source, v.mentions, v.sentiment, v.status, v.antecedentes, v.actores, v.angulos, v.audiencia
FROM (VALUES
  ('Aumento de robos a comercios en el centro', 'Facebook', 34, 'negativo', 'Nuevo',
    'Tercer reporte de robos a locales del centro en dos semanas. La página de la policía municipal no ha emitido comunicado oficial.',
    'Policía municipal, Cámara de Comercio de Perote, comerciantes afectados',
    'Cronología de los tres casos; entrevista a comerciantes; postura de la policía municipal',
    'Alto — tema de seguridad genera alta interacción local'),
  ('Nueva ciclovía en la avenida Reforma', 'Perplexity', 12, 'positivo', 'Nuevo',
    'El ayuntamiento publicó el trazo preliminar de una ciclovía piloto de 2km sobre avenida Reforma.',
    'Ayuntamiento de Perote, colectivo ciclista local, comerciantes de la avenida',
    'Mapa del trazo; reacciones de comerciantes; comparación con otras ciudades de la región',
    'Medio — interés de nicho pero buen potencial de compartidos'),
  ('Quejas por corte de agua en la colonia Centro', 'TikTok', 58, 'negativo', 'Revisado',
    'Corte de agua de 4 días sin aviso previo. Videos de vecinos acumulan miles de vistas.',
    'Comisión municipal de agua, vecinos de la colonia Centro',
    'Cronología del corte; postura oficial; impacto en negocios locales',
    'Alto — queja ciudadana con alto engagement en redes'),
  ('Video viral sobre bache en la carretera a Xalapa', 'TikTok', 76, 'negativo', 'Nuevo',
    'Video de un vehículo dañado por un bache acumula más de 70 menciones en 24 horas.',
    'Obras públicas municipales, automovilistas afectados',
    'Verificación en sitio; respuesta de obras públicas; reincidencia del problema',
    'Alto — formato viral con alto potencial de alcance'),
  ('Aumento en el precio del gas en la región', 'Perplexity', 27, 'neutral', 'Nuevo',
    'Precio del gas LP subió 8% en las últimas tres semanas en la región.',
    'Distribuidoras de gas, CRE, consumidores',
    'Comparativo de precios semanal; explicación del alza; impacto en hogares',
    'Medio — tema económico de interés amplio')
) AS v(title, source, mentions, sentiment, status, antecedentes, actores, angulos, audiencia)
WHERE NOT EXISTS (SELECT 1 FROM topics t WHERE t.title = v.title);

-- Pipeline de contenido: propuestas IA sin decidir, piezas en borrador/revisión, una rechazada.
-- (Los 24 artículos 'published' ya viven en 002_web_articles.sql — aquí solo las etapas previas.)
INSERT INTO content_proposals (topic_id, format, title, body, status, section, angulo, sensibilidad, author_id)
SELECT t.id, v.format, v.title, v.body, v.status, v.section, v.angulo, v.sensibilidad, u.id
FROM (VALUES
  ('Aumento de robos a comercios en el centro', 'Nota', 'Propuesta: reconstrucción de robos al comercio del centro', NULL, 'propuesta', NULL, 'Reconstrucción de los últimos tres casos con cifras de la policía municipal', 'rojo', NULL),
  ('Nueva ciclovía en la avenida Reforma', 'Post', 'Propuesta: anuncio de la ciclovía de Reforma', NULL, 'propuesta', NULL, 'Anuncio con mapa del trazo y reacciones de comerciantes', 'verde', NULL)
) AS v(topic_title, format, title, body, status, section, angulo, sensibilidad, author_email)
JOIN topics t ON t.title = v.topic_title
LEFT JOIN users u ON u.email = v.author_email
WHERE NOT EXISTS (SELECT 1 FROM content_proposals c WHERE c.title = v.title);

INSERT INTO content_proposals (format, title, body, status, section, author_id)
SELECT v.format, v.title, v.body, v.status, v.section, u.id
FROM (VALUES
  ('Nota', 'Casa de la cultura prepara ciclo de cine al aire libre', 'Borrador en proceso sobre el nuevo ciclo de cine al aire libre...', 'borrador', 'Cultura', 'ana.torres@crearcontenidos.com'),
  ('Nota', 'Liga infantil de básquetbol arranca temporada en la unidad deportiva', 'Borrador en proceso sobre el arranque de la liga infantil...', 'borrador', 'Deportes', 'ana.torres@crearcontenidos.com'),
  ('Nota', 'Cinco años de Ferretería Reyes en el corazón de Perote', 'Nota enviada a revisión sobre el aniversario de Ferretería Reyes...', 'en_revision', 'Economía', 'carlos.mendoza@crearcontenidos.com'),
  ('Nota', 'Hotel San Carlos abre nueva ala con vista al Cofre de Perote', 'Nota enviada a revisión sobre la nueva ala del Hotel San Carlos...', 'en_revision', 'Economía', 'luisa.perez@crearcontenidos.com'),
  ('Nota', 'Cobertura de feria comercial fuera de la zona de cobertura', 'Propuesta descartada por estar fuera del área editorial.', 'rechazada', 'Economía', 'tomas.ibarra@crearcontenidos.com')
) AS v(format, title, body, status, section, author_email)
JOIN users u ON u.email = v.author_email
WHERE NOT EXISTS (SELECT 1 FROM content_proposals c WHERE c.title = v.title);

UPDATE content_proposals SET review_comment = 'Fuera de zona de cobertura editorial — no aplica para CREA Perote.'
WHERE title = 'Cobertura de feria comercial fuera de la zona de cobertura' AND review_comment IS NULL;

-- Pipeline comercial
INSERT INTO clients (name, business_name, package, phone, email, active, pipeline_stage, interest, estimated_value, last_contact_at, owner_id)
SELECT v.name, v.business_name, v.package, v.phone, v.email, true, v.pipeline_stage, v.interest, v.estimated_value, v.last_contact_at::timestamptz, u.id
FROM (VALUES
  ('Auto Refacciones Cofre', 'Auto Refacciones Cofre', NULL, NULL, NULL, 'identificado', 'Publicidad display mensual', '$1,200 MXN/mes', '2026-06-24'),
  ('Panadería La Espiga', 'Panadería La Espiga', NULL, NULL, NULL, 'identificado', 'Branded content básico', '$2,000 MXN', '2026-06-20'),
  ('Restaurante Mirador', 'Restaurante Mirador', NULL, NULL, NULL, 'contactado', 'Cobertura de evento', '$4,500 MXN', '2026-06-27'),
  ('Gasolinera Perote', 'Gasolinera Perote', NULL, NULL, NULL, 'contactado', 'Patrocinio de sección mensual', '$2,800 MXN/mes', '2026-06-18'),
  ('Constructora Altotonga', 'Constructora Altotonga', NULL, NULL, NULL, 'propuesta_enviada', 'Patrocinio de sección mensual', '$3,500 MXN/mes', '2026-06-29'),
  ('Farmacia del Centro', 'Farmacia del Centro', NULL, NULL, NULL, 'propuesta_enviada', 'Publicidad display mensual', '$1,000 MXN/mes', '2026-06-15'),
  ('Ferretería Reyes', 'Ferretería Reyes', NULL, NULL, NULL, 'cerrado', 'Patrocinio de sección mensual', '$3,000 MXN/mes', '2026-06-10')
) AS v(name, business_name, package, phone, email, pipeline_stage, interest, estimated_value, last_contact_at)
CROSS JOIN (SELECT id FROM users WHERE email = 'comercial@crearcontenidos.com') u
WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE c.name = v.name);
