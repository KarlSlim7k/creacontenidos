CREATE TABLE IF NOT EXISTS topics (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT,
  mentions INTEGER NOT NULL DEFAULT 0,
  sentiment TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new'
);
