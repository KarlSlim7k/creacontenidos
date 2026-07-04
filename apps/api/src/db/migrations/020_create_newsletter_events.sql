-- Agenda del newsletter "Buenos días, Perote": eventos reales cargados a mano
-- (cortes de agua, eventos culturales, partidos, trámites). Sin esto, "agenda"
-- se queda null — nunca inventado por la IA.
CREATE TABLE IF NOT EXISTS newsletter_events (
  id SERIAL PRIMARY KEY,
  event_date DATE NOT NULL,
  title TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS newsletter_events_date_idx ON newsletter_events (event_date);
