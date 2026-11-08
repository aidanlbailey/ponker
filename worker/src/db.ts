// Every bit of SQL the accounts run, against D1. The tables are in migrations/.

import { hashToken, newToken, SESSION_DAYS } from './accounts'
import type { HandStats, Rated } from './room'
import { capBots, exchange, isBot, nyDay, PLACEMENT_HANDS, PROVISIONAL, seedOf, BOT_SEEDS } from './rating'
import { botById } from '../../src/game/roster'

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

// sessions, reports and stats cascade. Ratings are keyed by text so they go by hand
export async function deleteUser(db: D1Database, userId: number) {
  const who = `u:${userId}`
  await db.batch([
    db.prepare('DELETE FROM ratings WHERE who = ?').bind(who),
    db.prepare('DELETE FROM pair_day WHERE a = ? OR b = ?').bind(who, who),
    db.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ])
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

export type Stats = { bots: number; hands: number; net: number; vpip: number; pfr: number; showdowns: number; showdown_wins: number; biggest: number }

// one row written per player per hand. Batched so a hand's players go in one call
export async function addStats(db: D1Database, lines: HandStats[]) {
  if (!lines.length) return
  const add = db.prepare(
    `INSERT INTO stats (user_id, bots, hands, net, vpip, pfr, showdowns, showdown_wins, biggest) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, bots) DO UPDATE SET hands = hands + 1, net = net + excluded.net, vpip = vpip + excluded.vpip,
       pfr = pfr + excluded.pfr, showdowns = showdowns + excluded.showdowns, showdown_wins = showdown_wins + excluded.showdown_wins,
       biggest = MAX(biggest, excluded.biggest)`,
  )
  await db.batch(lines.map((l) => add.bind(l.user, +l.bots, l.net, +l.vpip, +l.pfr, +l.showdown, +l.won, l.pot)))
}

export async function statsOf(db: D1Database, userId: number) {
  const { results } = await db.prepare('SELECT bots, hands, net, vpip, pfr, showdowns, showdown_wins, biggest FROM stats WHERE user_id = ?').bind(userId).all<Stats>()
  return results
}

const marks = (n: number) => Array(n).fill('?').join(', ')

// Closed pairs from a table. Read the ratings once, work them through in order so someone in two pairs
// compounds, then write. A rating is only ever added onto, never set, so another table writing the same
// bot at the same moment can't undo this one
export async function rate(db: D1Database, pairs: Rated[], played: { who: string; hands: number }[], now: number) {
  if (!pairs.length) return
  const day = nyDay(now)
  const ids = [...new Set(pairs.flatMap((p) => [p.a, p.b]))]
  const [{ results: rows }, { results: today }] = (await db.batch([
    db.prepare(`SELECT who, rating, updates FROM ratings WHERE who IN (${marks(ids.length)})`).bind(...ids),
    db.prepare(`SELECT a, b, moved FROM pair_day WHERE day = ? AND a IN (${marks(ids.length)})`).bind(day, ...ids),
  ])) as [D1Result<{ who: string; rating: number; updates: number }>, D1Result<{ a: string; b: string; moved: number }>]
  const cur = new Map(ids.map((id) => [id, rows.find((r) => r.who === id) ?? { who: id, rating: seedOf(id), updates: 0 }]))
  const moved = new Map(today.map((t) => [`${t.a}|${t.b}`, t.moved]))
  const add = db.prepare(
    'INSERT INTO ratings (who, rating, updates) VALUES (?, ?, 1) ON CONFLICT (who) DO UPDATE SET rating = rating + ?, updates = updates + 1',
  )
  const swap = db.prepare('INSERT INTO pair_day (day, a, b, moved) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET moved = moved + excluded.moved')
  // placement hands go in even when the cap stops the rating moving
  const hands = db.prepare('INSERT INTO ratings (who, rating, hands) VALUES (?, ?, ?) ON CONFLICT (who) DO UPDATE SET hands = hands + excluded.hands')
  const writes: D1PreparedStatement[] = played.map((p) => hands.bind(p.who, seedOf(p.who), p.hands))
  for (const p of pairs) {
    const a = cur.get(p.a)!
    const b = cur.get(p.b)!
    const fresh = [a, b].some((x) => !isBot(x.who) && x.updates < PROVISIONAL)
    const delta = capBots(exchange(a.rating, b.rating, p.n, p.d, fresh, moved.get(`${p.a}|${p.b}`) ?? 0), a, b)
    if (!delta) continue
    writes.push(add.bind(p.a, seedOf(p.a) + delta, delta), add.bind(p.b, seedOf(p.b) - delta, -delta), swap.bind(day, p.a, p.b, Math.abs(delta)))
    a.rating += delta
    b.rating -= delta
    a.updates++
    b.updates++
    moved.set(`${p.a}|${p.b}`, (moved.get(`${p.a}|${p.b}`) ?? 0) + Math.abs(delta))
  }
  writes.push(db.prepare('DELETE FROM pair_day WHERE day < ?').bind(nyDay(now - 7 * DAY_MS)))
  await db.batch(writes)
}

// what to show for each. null is a person still placing. Placement counts the hands kept with the rating, so a
// reset or a wipe puts someone back in it. Rounded, the decimals are only there so small updates don't get lost
export async function ratingsOf(db: D1Database, ids: string[]) {
  if (!ids.length) return {}
  const { results: rows } = await db
    .prepare(`SELECT who, rating, hands FROM ratings WHERE who IN (${marks(ids.length)})`)
    .bind(...ids)
    .all<{ who: string; rating: number; hands: number }>()
  return Object.fromEntries(
    ids.map((id) => {
      const row = rows.find((r) => r.who === id)
      const placed = isBot(id) || (row?.hands ?? 0) >= PLACEMENT_HANDS
      return [id, placed ? Math.round(row?.rating ?? seedOf(id)) : null]
    }),
  )
}

export type RatingRow = { id: string; name: string; avatar: string | null; rating: number; bot: boolean; letter?: string }
export type RateRow = { id: string; name: string; avatar: string | null; hands: number; net: number }

// ponytail: top 50 each, no rank for anyone below. Add a count query when there are enough players to need it
export async function boards(db: D1Database, minHands: number) {
  const [{ results: people }, { results: bots }, { results: rates }] = (await db.batch([
    db.prepare(
      `SELECT u.id, u.name, u.avatar, r.rating FROM ratings r JOIN users u ON r.who = 'u:' || u.id
       WHERE r.hands >= ? ORDER BY r.rating DESC LIMIT 50`,
    ).bind(PLACEMENT_HANDS),
    db.prepare("SELECT who, rating FROM ratings WHERE who LIKE 'bot:%'"),
    db.prepare(
      `SELECT u.id, u.name, u.avatar, s.hands, s.net FROM stats s JOIN users u ON u.id = s.user_id
       WHERE s.bots = 0 AND s.hands >= ? ORDER BY CAST(s.net AS REAL) / s.hands DESC LIMIT 50`,
    ).bind(minHands),
  ])) as [
    D1Result<{ id: number; name: string; avatar: string | null; rating: number }>,
    D1Result<{ who: string; rating: number }>,
    D1Result<{ id: number; name: string; avatar: string | null; hands: number; net: number }>,
  ]
  const rating: RatingRow[] = [
    ...people.map((p) => ({ id: `u:${p.id}`, name: p.name, avatar: p.avatar, rating: Math.round(p.rating), bot: false })),
    // every bot's on it, the ones nobody's played yet at their seed
    ...Object.keys(BOT_SEEDS).map((id) => ({
      id,
      name: botById(id)?.name ?? id,
      letter: botById(id)?.letter,
      avatar: null,
      rating: Math.round(bots.find((b) => b.who === id)?.rating ?? seedOf(id)),
      bot: true,
    })),
  ].sort((x, y) => y.rating - x.rating)
  const bb100: RateRow[] = rates.map((r) => ({ id: `u:${r.id}`, name: r.name, avatar: r.avatar, hands: r.hands, net: r.net }))
  return { rating, bb100 }
}

// back to the start. Whoever they took it from keeps it, that's fine for a reset
export async function resetRating(db: D1Database, userId: number) {
  await db.prepare('DELETE FROM ratings WHERE who = ?').bind(`u:${userId}`).run()
}

export type PairDay = { a: string; b: string; a_name: string | null; b_name: string | null; moved: number }

// the pairs who swapped the most today, for spotting feeding
export async function pairsToday(db: D1Database, now: number) {
  const { results } = await db
    .prepare(
      `SELECT p.a, p.b, ua.name AS a_name, ub.name AS b_name, p.moved FROM pair_day p
       LEFT JOIN users ua ON p.a = 'u:' || ua.id LEFT JOIN users ub ON p.b = 'u:' || ub.id
       WHERE p.day = ? ORDER BY p.moved DESC LIMIT 20`,
    )
    .bind(nyDay(now))
    .all<PairDay>()
  return results.map((p) => ({ ...p, a_name: p.a_name ?? botById(p.a)?.name ?? p.a, b_name: p.b_name ?? botById(p.b)?.name ?? p.b }))
}
