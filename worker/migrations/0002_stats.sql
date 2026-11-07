-- Running totals per player, bot hands kept apart from bot-free ones. One row each, added onto every hand
CREATE TABLE stats (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  bots INTEGER NOT NULL, -- 1 when a bot was dealt in
  hands INTEGER NOT NULL DEFAULT 0,
  net INTEGER NOT NULL DEFAULT 0, -- chips
  vpip INTEGER NOT NULL DEFAULT 0,
  pfr INTEGER NOT NULL DEFAULT 0,
  showdowns INTEGER NOT NULL DEFAULT 0,
  showdown_wins INTEGER NOT NULL DEFAULT 0,
  biggest INTEGER NOT NULL DEFAULT 0, -- the most won in one hand
  PRIMARY KEY (user_id, bots)
);
