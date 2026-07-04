CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  detail TEXT,
  user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'exito',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
