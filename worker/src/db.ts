// Every bit of SQL the accounts run, against D1. The tables are in migrations/.

import { hashToken, newToken, SESSION_DAYS } from './accounts'

export type User = { id: number; name: string; avatar: string | null }
export type Reported = User & { reports: number; last: number }

const DAY_MS = 24 * 3600_000

export async function userBySession(db: D1Database, token: string, now: number) {
  return db
    .prepare('SELECT u.id, u.name, u.avatar FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires > ?')
    .bind(await hashToken(token), now)
    .first<User>()
}

export async function userByProvider(db: D1Database, provider: string, providerId: string) {
  return db.prepare('SELECT id, name, avatar FROM users WHERE provider = ? AND provider_id = ?').bind(provider, providerId).first<User>()
}

export async function nameTaken(db: D1Database, name: string, except = 0) {
  return !!(await db.prepare('SELECT 1 FROM users WHERE name_lc = ? AND id != ?').bind(name.toLowerCase(), except).first())
}

// null when the name went to someone else first
export async function createUser(db: D1Database, provider: string, providerId: string, name: string, now: number) {
  try {
    return await db
      .prepare('INSERT INTO users (provider, provider_id, name, name_lc, created) VALUES (?, ?, ?, ?, ?) RETURNING id, name, avatar')
      .bind(provider, providerId, name, name.toLowerCase(), now)
      .first<User>()
  } catch (e) {
    if (String(e).includes('UNIQUE')) return null
    throw e
  }
}

// a sign-in also clears out that player's dead sessions, nothing else ever would
export async function createSession(db: D1Database, userId: number, now: number) {
  const token = newToken()
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires <= ?').bind(userId, now),
    db.prepare('INSERT INTO sessions (hash, user_id, expires) VALUES (?, ?, ?)').bind(await hashToken(token), userId, now + SESSION_DAYS * DAY_MS),
  ])
  return token
}

export async function endSession(db: D1Database, token: string) {
  await db.prepare('DELETE FROM sessions WHERE hash = ?').bind(await hashToken(token)).run()
}

// false when the name's taken
export async function rename(db: D1Database, userId: number, name: string) {
  try {
    await db.prepare('UPDATE users SET name = ?, name_lc = ? WHERE id = ?').bind(name, name.toLowerCase(), userId).run()
    return true
  } catch (e) {
    if (String(e).includes('UNIQUE')) return false
    throw e
  }
}

// reports were about the old picture, so they go with it
export async function setAvatar(db: D1Database, userId: number, avatar: string | null) {
  await db.batch([
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').bind(avatar, userId),
    db.prepare('DELETE FROM reports WHERE user_id = ?').bind(userId),
  ])
}

// sessions and reports cascade
export async function deleteUser(db: D1Database, userId: number) {
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run()
}

// false when there's nothing there to report
export async function report(db: D1Database, userId: number, reporterId: number, now: number) {
  const res = await db
    .prepare('INSERT INTO reports (user_id, reporter_id, at) SELECT id, ?, ? FROM users WHERE id = ? AND avatar IS NOT NULL ON CONFLICT DO NOTHING')
    .bind(reporterId, now, userId)
    .run()
  return res.meta.changes > 0 || !!(await db.prepare('SELECT 1 FROM users WHERE id = ? AND avatar IS NOT NULL').bind(userId).first())
}

export async function reported(db: D1Database) {
  const { results } = await db
    .prepare(
      'SELECT u.id, u.name, u.avatar, COUNT(*) AS reports, MAX(r.at) AS last FROM reports r JOIN users u ON u.id = r.user_id GROUP BY u.id ORDER BY last DESC LIMIT 100',
    )
    .all<Reported>()
  return results
}

export async function dismiss(db: D1Database, userId: number) {
  await db.prepare('DELETE FROM reports WHERE user_id = ?').bind(userId).run()
}
