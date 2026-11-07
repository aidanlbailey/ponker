-- Ratings, people as u:<id> and bots by roster id. No row means the starting number, so nobody needs one made
CREATE TABLE ratings (
  who TEXT PRIMARY KEY,
  rating REAL NOT NULL,
  updates INTEGER NOT NULL DEFAULT 0
);

-- how much rating each pair swapped on a New York day, for the cap and the admin list. Pruned after a week
CREATE TABLE pair_day (
  day TEXT NOT NULL,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  moved REAL NOT NULL,
  PRIMARY KEY (day, a, b)
);
