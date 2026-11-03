// Every bit of SQL the table runs. The room is one JSON row, saved whole after every change.

import type { Room } from './room'

// the table's made on the first save, not on wake. Making it costs 2 rows and leaves a 12KB database,
// which a bad token or a refused room would otherwise leave behind for good. And deleteAll() drops it,
// so a room that clears has to be able to come back without the object waking from cold
const exists = (sql: SqlStorage) => sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'room'").toArray().length > 0

export function loadRoom(sql: SqlStorage): Room | null {
  if (!exists(sql)) return null
  const row = sql.exec<{ json: string }>('SELECT json FROM room WHERE id = 1').toArray()[0]
  return row ? (JSON.parse(row.json) as Room) : null
}

// one row written, plus the 2 for the table on a room's first save. The caller counts the one
export function saveRoom(sql: SqlStorage, room: Room) {
  sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY, json TEXT NOT NULL)')
  sql.exec('INSERT INTO room (id, json) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json', JSON.stringify(room))
}
