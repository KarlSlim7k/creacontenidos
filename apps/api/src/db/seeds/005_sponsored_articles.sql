-- Seed dev: contenido patrocinado ("Aliados de CREA" en portada y patrocinado.html).
-- Mismas notas que traía el mockup estático, ahora como filas reales con
-- is_sponsored = true. Idempotente vía ON CONFLICT (slug) DO NOTHING.
INSERT INTO content_proposals
  (format, status, title, slug, section, dek, author_name, body, published_at, is_sponsored, sponsor_name)
VALUES
  ('nota', 'published',
   'Cinco años de Ferretería Reyes en el corazón de Perote',
   'cinco-anos-ferreteria-reyes-perote', 'Local',
   'Cómo un negocio familiar se convirtió en referencia del centro.',
   'Equipo CREA',
   'Ferretería Reyes cumple cinco años en el centro de Perote y lo celebra como lo que siempre ha sido: un negocio familiar que conoce a sus clientes por nombre.

Lo que empezó como un local pequeño frente al mercado hoy surte a contratistas de todo el corredor Perote–Xalapa. Sus dueños atribuyen el crecimiento a algo simple: nunca dejar de atender el mostrador ellos mismos.',
   now() - interval '2 days', true, 'Ferretería Reyes'),

  ('nota', 'published',
   'Hotel San Carlos abre nueva ala con vista al Cofre de Perote',
   'hotel-san-carlos-nueva-ala-cofre-perote', 'Local',
   'Una mirada a la ampliación que busca recibir más visitantes este invierno.',
   'Equipo CREA',
   'El Hotel San Carlos inauguró una nueva ala de habitaciones con vista directa al Cofre de Perote, pensada para la temporada alta de visitantes que llega con el frío.

La ampliación suma quince habitaciones y una terraza común, y forma parte de una apuesta más amplia del hotel por el turismo de fin de semana que llega desde Xalapa y Puebla.',
   now() - interval '4 days', true, 'Hotel San Carlos'),

  ('nota', 'published',
   'Por qué cada vez más negocios del centro se anuncian con CREA',
   'negocios-centro-se-anuncian-con-crea', 'Economía',
   'Tres comerciantes locales cuentan su experiencia con branded content.',
   'Equipo CREA',
   'Tres comerciantes del centro de Perote comparten por qué decidieron anunciarse con CREA: alcance local real, sin competir con publicidad de otras ciudades.

Coinciden en algo: el contenido patrocinado, cuando se hace con cuidado editorial, no se siente como anuncio. Se siente como una nota más del medio que ya leen sus vecinos.',
   now() - interval '6 days', true, 'Varios anunciantes'),

  ('nota', 'published',
   'Farmacia del Centro amplía su servicio a domicilio',
   'farmacia-del-centro-servicio-domicilio', 'Local',
   'La farmacia más antigua de Perote ahora cubre todo el corredor en menos de una hora.',
   'Equipo CREA',
   'La Farmacia del Centro, la más antigua de Perote, amplió su servicio a domicilio para cubrir todo el corredor Perote–Xalapa–Puebla en menos de una hora.

El servicio, antes limitado al centro, ahora llega hasta Las Vigas y Tenextepec gracias a un convenio con repartidores locales.',
   now() - interval '8 days', true, 'Farmacia del Centro'),

  ('nota', 'published',
   'Restaurante Mirador estrena menú de temporada con productos locales',
   'restaurante-mirador-menu-temporada', 'Entretenimiento',
   'Una propuesta gastronómica que celebra la papa y el clima frío de la región.',
   'Equipo CREA',
   'Restaurante Mirador presentó su menú de temporada, construido alrededor de la papa y otros productos del valle de Perote.

La carta incluye platillos pensados para el clima frío: caldos, guisados de olla y postres calientes, todos con proveedores del mercado municipal.',
   now() - interval '10 days', true, 'Restaurante Mirador'),

  ('nota', 'published',
   'Constructora Altotonga impulsa vivienda accesible en la región',
   'constructora-altotonga-vivienda-accesible', 'Economía',
   'Un proyecto que busca atender la demanda de vivienda del corredor Perote–Xalapa.',
   'Equipo CREA',
   'Constructora Altotonga anunció un proyecto de vivienda accesible pensado para familias del corredor Perote–Xalapa que hoy rentan sin poder ahorrar para un patrimonio propio.

El desarrollo contempla financiamiento escalonado y una primera etapa de cuarenta viviendas, con entrega prevista para el próximo año.',
   now() - interval '12 days', true, 'Constructora Altotonga')
ON CONFLICT (slug) DO NOTHING;
