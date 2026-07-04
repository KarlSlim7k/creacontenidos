-- Producciones CREA — seed de muestra para validar visualmente el feed.
-- Las URLs son videos públicos; metadata resuelta vía oEmbed (TikTok) o
-- pendiente de token (Facebook/Instagram). El embed iframe se construye
-- on-demand; si la red cae, los posts siguen visibles con thumbnail + link.
INSERT INTO social_posts (network, external_url, title, author_name, thumbnail_url, is_published, position, fetched_at)
SELECT v.network, v.url, v.title, v.author, v.thumb, true, v.pos, now()
FROM (VALUES
  ('tiktok',
   'https://www.tiktok.com/@crea_contenidos/video/7657738133844380936',
   'Uno de los clientes de Crea contenidos, el medio digital de Perote #Perote #Sushi #foodie #comida #creacontenidos',
   'Crea Contenidos',
   'https://p16-common-sign.tiktokcdn.com/tos-alisg-p-0037/oYInmRBqARFwfiSi2QpBFgCEcMBfAbgKjI58ib~tplv-tiktokx-origin.image?dr=14575&x-expires=1783141200&x-signature=BbTRbsBwzwCMUP1lO5JLHnIB1HA%3D&t=4d5b0474&ps=13740610&shp=81f88b70&shcp=43f4a2f9&idc=my',
   0),
  ('tiktok',
   'https://www.tiktok.com/@crea_contenidos/video/7657335342944570631',
   'Perote: 5 siglos de historia viva que cobran vida con IA. ¡Un eco que te emocionará, el Profesor David Medina Arcos! #Perote #CuentamedePerote #Peroteña #500años #HistoriaViva',
   'Crea Contenidos',
   'https://p16-common-sign.tiktokcdn.com/tos-alisg-p-4863-sg/oMBIvqFBE9HEv7F90wQBxVEQsogf8mtI4KRIfD~tplv-tiktokx-origin.image?dr=14575&x-expires=1783141200&x-signature=nSl%2BvJEVMfqruhdO8j0EwXorawc%3D&t=4d5b0474&ps=13740610&shp=81f88b70&shcp=43f4a2f9&idc=my',
   1),
  ('tiktok',
   'https://www.tiktok.com/@crea_contenidos/video/7657208756568083729',
   'Reviviendo el pasado en Perote. La calle Pino Suárez, esquina con 16 de Septiembre y Guerrero, te transportará.Utilizamos la IA de runway para generar esta secuencia. #Perote #CuentamedePerote #Peroteña #PueblosMagicos #Recuerdos',
   'Crea Contenidos',
   'https://p19-common-sign.tiktokcdn.com/tos-alisg-v-89e0aa-sg/oYAdAft4DBCqFAvvVHEv92IaQCpQ1ALggp9f7E~tplv-tiktokx-origin.image?dr=14575&x-expires=1783141200&x-signature=gDmz9FHlpLiFgNlSW7bADyvgMcI%3D&t=4d5b0474&ps=13740610&shp=81f88b70&shcp=43f4a2f9&idc=my',
   2),
  ('facebook',
   'https://www.facebook.com/100079776720617/videos/1271611311516190/',
   'Tercer Tiempo',
   'Crea Contenidos',
   NULL,
   3),
  ('instagram',
   'https://www.instagram.com/p/CmQSSVjhlU7/',
   'Rompiendo el empaque del Tianguis Turístico de Pueblos Mágicos',
   'Turismo Veracruz',
   NULL,
   4)
) AS v(network, url, title, author, thumb, pos)
ON CONFLICT (external_url) DO NOTHING;
