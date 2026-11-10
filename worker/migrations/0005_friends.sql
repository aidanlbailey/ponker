-- one row each way. Only from_id's row is a request waiting on to_id, both rows is friends
CREATE TABLE friends (
  from_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX friends_to ON friends (to_id);
