INSERT INTO topics (title, source, mentions, sentiment, status) VALUES
  ('Corte de agua en el centro de Perote', 'perplexity', 34, 'negative', 'new'),
  ('Feria del elote 2026', 'perplexity', 12, 'positive', 'new'),
  ('Bacheo en la carretera federal', 'perplexity', 8, 'neutral', 'reviewed')
ON CONFLICT DO NOTHING;

INSERT INTO content_proposals (topic_id, format, title, body, image_prompt, status) VALUES
  (1, 'nota', 'Vecinos denuncian corte de agua de 3 días en el centro de Perote', 'Cuerpo de nota de prueba...', 'Foto de una llave de agua seca en una calle de Perote', 'pending'),
  (2, 'post', 'Todo listo para la Feria del Elote 2026', 'Copy de post de prueba...', 'Ilustración festiva de elotes con colores de Perote', 'pending'),
  (3, 'meme', 'El bache que ya es parte de la familia', 'Texto de meme de prueba...', 'Meme de un bache gigante en la carretera federal', 'approved')
ON CONFLICT DO NOTHING;
