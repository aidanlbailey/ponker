// Every bit of SQL the table runs. The room is one JSON row, saved whole after every change.

import type { Room } from './room'

export function setup(sql: SqlStorage) {
  sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY, json TEXT NOT NULL)')
}

export function loadRoom(sql: SqlStorage): Room | null {
  const row = sql.exec<{ json: string }>('SELECT json FROM room WHERE id = 1').toArray()[0]
  return row ? (JSON.parse(row.json) as Room) : null
}

// rows written, for the budget
export function saveRoom(sql: SqlStorage, room: Room) {
  const cursor = sql.exec(
    'INSERT INTO room (id, json) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json',
    JSON.stringify(room),
  )
  cursor.toArray()
  return cursor.rowsWritten
}
