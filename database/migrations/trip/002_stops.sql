CREATE TABLE IF NOT EXISTS stops (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (city, name)
);

CREATE INDEX IF NOT EXISTS stops_city_idx ON stops (city, name);
