CREATE TABLE IF NOT EXISTS competitor_posts (
  id SERIAL PRIMARY KEY,
  source_platform TEXT NOT NULL,
  source_account TEXT,
  post_url TEXT,
  post_text TEXT,
  post_date TIMESTAMPTZ,
  reactions INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  media_type TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analyzed BOOLEAN NOT NULL DEFAULT false
);
