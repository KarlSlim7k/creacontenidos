CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id),
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  pdf_url TEXT,
  sent_at TIMESTAMPTZ
);
