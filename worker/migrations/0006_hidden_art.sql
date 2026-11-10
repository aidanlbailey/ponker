CREATE TABLE hidden_art (
  reporter_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (reporter_id, user_id)
);

INSERT INTO hidden_art (reporter_id, user_id)
SELECT reporter_id, user_id FROM reports;
