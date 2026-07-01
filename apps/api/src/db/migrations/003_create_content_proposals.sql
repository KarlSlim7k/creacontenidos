CREATE TABLE IF NOT EXISTS content_proposals (
  id SERIAL PRIMARY KEY,
  topic_id INTEGER REFERENCES topics(id),
  format TEXT NOT NULL,
  title TEXT,
  body TEXT,
  image_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
