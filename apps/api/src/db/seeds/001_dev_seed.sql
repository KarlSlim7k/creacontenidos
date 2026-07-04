-- Idempotente vía WHERE NOT EXISTS (title): topics/content_proposals no tienen
-- constraint único sobre estas columnas, así que ON CONFLICT no aplica aquí.
INSERT INTO topics (title, source, mentions, sentiment, status)
SELECT v.title, v.source, v.mentions, v.sentiment, v.status
FROM (VALUES
  ('Corte de agua en el centro de Perote', 'perplexity', 34, 'negative', 'new'),
  ('Feria del elote 2026', 'perplexity', 12, 'positive', 'new'),
  ('Bacheo en la carretera federal', 'perplexity', 8, 'neutral', 'reviewed')
) AS v(title, source, mentions, sentiment, status)
WHERE NOT EXISTS (SELECT 1 FROM topics t WHERE t.title = v.title);

INSERT INTO content_proposals (topic_id, format, title, body, image_prompt, status)
SELECT v.topic_id, v.format, v.title, v.body, v.image_prompt, v.status
FROM (VALUES
  (1, 'nota', 'Vecinos denuncian corte de agua de 3 días en el centro de Perote', 'Cuerpo de nota de prueba...', 'Foto de una llave de agua seca en una calle de Perote', 'pending'),
  (2, 'post', 'Todo listo para la Feria del Elote 2026', 'Copy de post de prueba...', 'Ilustración festiva de elotes con colores de Perote', 'pending'),
  (3, 'meme', 'El bache que ya es parte de la familia', 'Texto de meme de prueba...', 'Meme de un bache gigante en la carretera federal', 'approved')
) AS v(topic_id, format, title, body, image_prompt, status)
WHERE NOT EXISTS (SELECT 1 FROM content_proposals c WHERE c.title = v.title);
