CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  business_name TEXT,
  package TEXT,
  phone TEXT,
  email TEXT,
  start_date DATE,
  active BOOLEAN NOT NULL DEFAULT true
);
