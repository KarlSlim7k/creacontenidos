-- Una edición por día. El cron genera (status 'pendiente') y el director
-- aprueba/envía desde el panel (status 'enviado') — nunca se envía solo.
CREATE TABLE IF NOT EXISTS newsletter_editions (
  id SERIAL PRIMARY KEY,
  edition_date DATE NOT NULL UNIQUE,
  weekday TEXT NOT NULL,
  date_label TEXT NOT NULL,
  content JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  sent_by INTEGER REFERENCES users(id)
);
