CREATE TABLE IF NOT EXISTS client_content (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id),
  content_id INTEGER REFERENCES published_content(id),
  type TEXT,
  published_at TIMESTAMPTZ
);
