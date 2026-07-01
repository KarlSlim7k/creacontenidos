CREATE TABLE IF NOT EXISTS published_content (
  id SERIAL PRIMARY KEY,
  proposal_id INTEGER REFERENCES content_proposals(id),
  platform TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  url TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  interactions INTEGER NOT NULL DEFAULT 0
);
