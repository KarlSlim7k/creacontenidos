-- Seed dev: los 24 artículos del prototipo (CREA_ARTICLES en apps/web/assets/js/main.js)
-- como filas publicadas. Idempotente vía ON CONFLICT (slug) DO NOTHING.
-- Fechas: intervalos relativos del prototipo ("hace 2 horas", "ayer", ...) contra now().
INSERT INTO content_proposals
  (format, status, title, slug, section, dek, author_name, body, published_at)
VALUES
  -- Local
  ('nota', 'published',
   'El mercado de Perote se prepara para la temporada alta de la papa',
   'mercado-perote-temporada-alta-papa', 'Local',
   'Productores reportan cosecha estable y el ayuntamiento amplía los puestos de fin de semana.',
   'Carlos Mendoza',
   'El mercado municipal de Perote comenzó esta semana los preparativos para lo que productores locales describen como una temporada alta "tranquila pero sostenida" para la papa, el cultivo insignia de la región.

Según comerciantes consultados por CREA, el frío adelantado de las últimas semanas no afectó el volumen de cosecha esperado para julio. El ayuntamiento confirmó que los puestos de fin de semana en la explanada se ampliarán de 40 a 55 espacios a partir del próximo sábado.

La recomendación para quienes visiten el mercado este fin de semana es llegar temprano: los locatarios coinciden en que el mejor producto se agota antes del mediodía.',
   now() - interval '2 hours'),

  ('nota', 'published',
   'Cierre parcial de la carretera Perote–Xalapa por niebla',
   'cierre-parcial-carretera-perote-xalapa-niebla', 'Local',
   'Protección Civil recomienda manejar con precaución en el tramo La Joya–Las Vigas.',
   'Ana Torres',
   'Protección Civil municipal reportó esta mañana un cierre parcial de la carretera federal Perote–Xalapa por un banco de niebla densa en el tramo La Joya–Las Vigas.

Las autoridades pidieron a los automovilistas reducir la velocidad, encender las luces bajas y evitar rebases mientras la visibilidad se mantenga por debajo de los cincuenta metros. El paso se reabrirá por completo en cuanto mejoren las condiciones.',
   now() - interval '5 hours'),

  ('nota', 'published',
   'Vecinos del centro piden más alumbrado en la calle Hidalgo',
   'vecinos-piden-alumbrado-calle-hidalgo', 'Local',
   'Habitantes reportan al menos seis luminarias apagadas desde hace un mes.',
   'Carlos Mendoza',
   'Vecinos de la calle Hidalgo, en el centro de Perote, entregaron esta semana un oficio al ayuntamiento para pedir la reparación del alumbrado público: al menos seis luminarias llevan un mes apagadas.

Los habitantes señalan que la falta de luz complica el regreso a casa de quienes trabajan en el mercado y en los comercios del centro. La dirección de servicios municipales respondió que el diagnóstico del circuito está en curso y que las reparaciones comenzarían la próxima semana.',
   now() - interval '1 day'),

  ('nota', 'published',
   'Ayuntamiento abre consulta pública sobre el nuevo mercado municipal',
   'consulta-publica-nuevo-mercado-municipal', 'Local',
   'El cabildo recibirá propuestas vecinales hasta el próximo viernes.',
   'Luisa Pérez',
   'El cabildo de Perote abrió una consulta pública para recibir propuestas vecinales sobre el proyecto del nuevo mercado municipal, uno de los compromisos de infraestructura más esperados del año.

Las propuestas se recibirán por escrito en la oficina de participación ciudadana hasta el próximo viernes. Entre los temas que más interesan a los locatarios están la reubicación temporal de los puestos y el número final de espacios comerciales.',
   now() - interval '2 days'),

  -- Cultura
  ('nota', 'published',
   'Fuerte de San Carlos abre nueva ruta nocturna para visitantes',
   'fuerte-san-carlos-ruta-nocturna', 'Cultura',
   'El recorrido incluye la muralla original y un mirador hacia el Cofre de Perote.',
   'Ana Torres',
   'El Fuerte de San Carlos estrenó una ruta nocturna para visitantes que recorre la muralla original y termina en un mirador con vista al Cofre de Perote.

El recorrido, guiado por cronistas locales, se ofrecerá los viernes y sábados a partir de las siete de la tarde. Los organizadores recomiendan llevar abrigo: la temperatura en la explanada del fuerte baja notablemente después del atardecer.',
   now() - interval '3 hours'),

  ('nota', 'published',
   'Feria del libro llega a la plaza central este fin de semana',
   'feria-del-libro-plaza-central', 'Cultura',
   'Participan quince editoriales independientes del corredor Xalapa–Puebla.',
   'Luisa Pérez',
   'La plaza central de Perote recibirá este fin de semana una feria del libro con la participación de quince editoriales independientes del corredor Xalapa–Puebla.

Además de la venta de títulos, el programa incluye lecturas en voz alta para niños, una mesa sobre periodismo local y la presentación de dos autores veracruzanos. La entrada es libre y las actividades comienzan el sábado a las diez de la mañana.',
   now() - interval '1 day'),

  ('nota', 'published',
   'Taller de fotografía documental abre inscripciones en la casa de cultura',
   'taller-fotografia-documental-casa-cultura', 'Cultura',
   'El curso de seis semanas está dirigido a jóvenes de Perote y comunidades cercanas.',
   'Carlos Mendoza',
   'La casa de cultura de Perote abrió las inscripciones para un taller de fotografía documental de seis semanas, dirigido a jóvenes del municipio y de comunidades cercanas.

El curso, impartido por un fotoperiodista de la región, cubrirá desde el manejo básico de cámara hasta la construcción de una historia visual sobre la vida local. Los lugares son limitados y las inscripciones cierran a fin de mes.',
   now() - interval '2 days'),

  ('nota', 'published',
   'Mural colectivo rendirá homenaje a los productores de papa',
   'mural-colectivo-productores-papa', 'Cultura',
   'Artistas locales pintarán la fachada del mercado municipal este verano.',
   'Ana Torres',
   'Un grupo de artistas locales pintará este verano un mural colectivo en la fachada del mercado municipal como homenaje a los productores de papa de la región.

El boceto, elegido por votación entre los locatarios, retrata la cosecha al pie del Cofre de Perote. Los trabajos comenzarán en cuanto concluya la temporada de lluvias y se espera que el mural quede terminado antes de las fiestas patrias.',
   now() - interval '4 days'),

  -- Economía
  ('nota', 'published',
   'Así cerró el primer semestre el comercio del centro',
   'comercio-centro-primer-semestre', 'Economía',
   'Locatarios reportan ventas estables pese a la baja afluencia turística.',
   'Luisa Pérez',
   'El comercio del centro de Perote cerró el primer semestre del año con ventas estables, de acuerdo con un sondeo de CREA entre locatarios de las calles principales.

Aunque la afluencia turística fue menor que la del año pasado, los comerciantes atribuyen la estabilidad al consumo local y al movimiento del mercado municipal. Para el segundo semestre esperan un repunte ligado a la temporada alta de la papa y a las fiestas de fin de año.',
   now() - interval '6 hours'),

  ('nota', 'published',
   'Productores de papa reportan cosecha estable pese al frío adelantado',
   'productores-papa-cosecha-estable-frio', 'Economía',
   'El volumen esperado para julio no se vio afectado por las heladas tempranas.',
   'Carlos Mendoza',
   'Los productores de papa del valle de Perote reportaron que la cosecha de julio se mantiene estable pese a las heladas tempranas registradas en las últimas semanas.

"El producto viene parejo, no hay mermas grandes como el año pasado", resumió uno de los productores consultados. El volumen esperado permitirá surtir sin problema tanto el mercado local como los envíos al corredor Xalapa–Puebla.',
   now() - interval '1 day'),

  ('nota', 'published',
   'Tianguis de los domingos crece 20% en número de puestos',
   'tianguis-domingos-crece-20-por-ciento', 'Economía',
   'Comerciantes de Las Vigas y Tenextepec se suman a la oferta dominical.',
   'Ana Torres',
   'El tianguis dominical de Perote creció un veinte por ciento en número de puestos durante el último trimestre, impulsado por la llegada de comerciantes de Las Vigas y Tenextepec.

La coordinación de comercio municipal atribuye el crecimiento a la ampliación del horario y a la mejora del espacio en la explanada. Los propios tianguistas piden ahora más contenedores de basura y un área techada para la temporada de lluvias.',
   now() - interval '3 days'),

  ('nota', 'published',
   'Banco rural anuncia créditos para pequeños productores de papa',
   'banco-rural-creditos-productores-papa', 'Economía',
   'La línea de crédito busca apoyar la siembra de la próxima temporada.',
   'Luisa Pérez',
   'Una institución de banca rural anunció una nueva línea de crédito dirigida a pequeños productores de papa del valle de Perote, pensada para financiar la siembra de la próxima temporada.

Los créditos cubrirán semilla, fertilizante y renta de maquinaria, con pagos ajustados al calendario de cosecha. Los interesados podrán iniciar su trámite en el módulo que se instalará junto al mercado municipal a partir del lunes.',
   now() - interval '4 days'),

  -- Entretenimiento
  ('nota', 'published',
   'Cinco lugares para comer algo caliente en temporada de frío',
   'cinco-lugares-comer-caliente-temporada-frio', 'Entretenimiento',
   'Una ruta por las cocinas económicas favoritas del centro de Perote.',
   'Luisa Pérez',
   'Con el frío instalado en el valle, armamos una ruta por cinco cocinas económicas del centro de Perote donde siempre hay algo caliente en la mesa: caldos, guisados de temporada y café de olla.

La lista, construida con recomendaciones de lectores, va del mercado municipal a los portales de la plaza. Todas las opciones rondan precios accesibles y abren desde temprano, cuando el frío aprieta más.',
   now() - interval '1 day'),

  ('nota', 'published',
   'Cine de barrio: este mes proyectan clásicos del cine mexicano',
   'cine-barrio-clasicos-cine-mexicano', 'Entretenimiento',
   'La función es gratuita y se realiza cada jueves en la plaza cívica.',
   'Carlos Mendoza',
   'El ciclo de cine de barrio dedicará este mes sus funciones a clásicos del cine mexicano, con proyecciones gratuitas cada jueves en la plaza cívica de Perote.

La cartelera incluye títulos de la época de oro elegidos por votación en redes sociales. Las funciones comienzan a las siete de la tarde y los organizadores sugieren llevar cobija y llegar con anticipación para alcanzar lugar.',
   now() - interval '3 days'),

  ('nota', 'published',
   'Nueva cafetería de especialidad abre sus puertas cerca del Fuerte',
   'cafeteria-especialidad-cerca-del-fuerte', 'Entretenimiento',
   'El local apuesta por café cultivado en la zona alta de Veracruz.',
   'Ana Torres',
   'Una nueva cafetería de especialidad abrió sus puertas a unas calles del Fuerte de San Carlos, con una carta centrada en café cultivado en la zona alta de Veracruz.

Los propietarios, una pareja joven de la región, tuestan el grano en el propio local y ofrecen métodos de preparación poco comunes en Perote. El proyecto busca convertirse también en punto de reunión para talleres y catas abiertas al público.',
   now() - interval '4 days'),

  ('nota', 'published',
   'Grupo de teatro comunitario estrena obra inspirada en el Cofre de Perote',
   'teatro-comunitario-obra-cofre-perote', 'Entretenimiento',
   'La puesta en escena se presenta los próximos tres fines de semana.',
   'Luisa Pérez',
   'Un grupo de teatro comunitario de Perote estrena esta semana una obra inspirada en las historias y leyendas del Cofre de Perote, la montaña que define el paisaje del municipio.

La puesta en escena, construida a partir de testimonios de habitantes de las faldas del volcán, se presentará los próximos tres fines de semana en la casa de cultura. Los boletos son de cuota voluntaria y lo recaudado financiará la próxima producción del grupo.',
   now() - interval '6 days'),

  -- Deportes
  ('nota', 'published',
   'Equipo local de basquetbol clasifica a la final regional',
   'basquetbol-local-final-regional', 'Deportes',
   'El equipo enfrentará a Xalapa el próximo sábado en casa.',
   'Ana Torres',
   'El equipo de basquetbol de Perote aseguró su pase a la final regional tras imponerse anoche en un partido cerrado que se definió en los últimos minutos.

La final se jugará el próximo sábado en la cancha municipal, con Xalapa como rival. La directiva anunció que la entrada será gratuita y espera un lleno completo para arropar al equipo en casa.',
   now() - interval '4 hours'),

  ('nota', 'published',
   'Tercer Tiempo: así viene la jornada de este fin de semana',
   'tercer-tiempo-jornada-fin-de-semana', 'Deportes',
   'Repasamos los partidos clave del corredor antes de la transmisión en vivo.',
   'Carlos Mendoza',
   'La jornada deportiva del fin de semana llega cargada en el corredor Perote–Xalapa, y en Tercer Tiempo la repasamos completa antes de la transmisión en vivo.

Destacan el duelo de líderes de la liga municipal de fútbol y la semifinal de basquetbol femenil. La transmisión arranca el sábado al mediodía con el análisis de la mesa y los enlaces desde las canchas.',
   now() - interval '1 day'),

  ('nota', 'published',
   'Liga municipal de fútbol arranca su temporada de invierno',
   'liga-municipal-futbol-temporada-invierno', 'Deportes',
   'Doce equipos de Perote y comunidades vecinas se inscribieron este año.',
   'Carlos Mendoza',
   'La liga municipal de fútbol de Perote arranca este fin de semana su temporada de invierno con doce equipos inscritos, dos más que el año pasado, entre ellos representativos de comunidades vecinas.

Los partidos se jugarán los sábados y domingos en la unidad deportiva, con la final programada para antes de las fiestas decembrinas. La liga estrena además reglamento disciplinario y arbitraje certificado.',
   now() - interval '2 days'),

  ('nota', 'published',
   'Corredora local clasifica a la final estatal de atletismo',
   'corredora-local-final-estatal-atletismo', 'Deportes',
   'Competirá en la prueba de 5 mil metros el próximo mes.',
   'Ana Torres',
   'Una corredora de Perote clasificó a la final estatal de atletismo tras registrar su mejor marca personal en la eliminatoria regional celebrada en Xalapa.

Competirá el próximo mes en la prueba de cinco mil metros, donde llega como una de las favoritas de su categoría. Su entrenador destacó que buena parte de la preparación se hace en la altura del valle, una ventaja natural de entrenar en Perote.',
   now() - interval '3 days'),

  -- Opinión
  ('nota', 'published',
   'Lo que significa el crecimiento de Perote para sus vecinos',
   'crecimiento-perote-vecinos', 'Opinión',
   'Una reflexión sobre el cambio del centro histórico en los últimos años.',
   'Luisa Pérez',
   'Perote crece, y crece rápido. Basta caminar el centro histórico para notar los locales nuevos, las fachadas recién pintadas y el movimiento que hace cinco años no existía entre semana.

Pero el crecimiento también pregunta cosas incómodas: quién puede pagar las rentas nuevas, qué pasa con los oficios de siempre, cuánto del centro seguirá siendo de quienes lo habitan. Esta columna propone mirar el cambio sin nostalgia, pero también sin prisa por celebrarlo todo.',
   now() - interval '2 days'),

  ('nota', 'published',
   'Carta abierta: necesitamos más espacios públicos en el centro',
   'carta-abierta-espacios-publicos-centro', 'Opinión',
   'Un lector propone recuperar el parque junto al mercado municipal.',
   'Lector invitado',
   'Escribo esta carta como vecino del centro de Perote, donde los espacios para estar —no para consumir, solo para estar— se han ido reduciendo año con año.

Propongo algo concreto: recuperar el parque junto al mercado municipal, hoy a medio abandonar, con bancas, sombra y mantenimiento constante. No hace falta un gran proyecto; hace falta voluntad y un presupuesto modesto bien cuidado. El centro se disfruta más cuando hay dónde sentarse a verlo.',
   now() - interval '5 days'),

  ('nota', 'published',
   'Columna: el frío que nos define',
   'columna-el-frio-que-nos-define', 'Opinión',
   'Sobre el clima de Perote como parte de su identidad.',
   'Luisa Pérez',
   'En Perote el frío no es una queja: es una seña de identidad. Nos define tanto como el Cofre en el horizonte o el olor a tierra mojada del valle.

El frío organiza la vida: la hora del café, la cobija en el cine de barrio, el caldo del mercado al mediodía. Quizá por eso los peroteños hablamos del clima con una mezcla de resignación y orgullo, como quien presume una herencia que no eligió pero no cambiaría.',
   now() - interval '3 days'),

  ('nota', 'published',
   '¿Quién cuida el Cofre de Perote?',
   'quien-cuida-el-cofre-de-perote', 'Opinión',
   'Una mirada a los retos de conservación de la montaña que nos representa.',
   'Lector invitado',
   'El Cofre de Perote está en el escudo, en los nombres de los negocios y en la memoria de todos los que crecimos mirándolo. Pero la pregunta incómoda sigue ahí: ¿quién lo cuida?

La tala clandestina, los incendios y la presión sobre el agua del deshielo avanzan más rápido que los programas de conservación. Cuidar la montaña no es un asunto de románticos: es cuidar el agua que bebe el valle. Esta colaboración invita a ponerlo en el centro de la conversación pública.',
   now() - interval '6 days')
ON CONFLICT (slug) DO NOTHING;
