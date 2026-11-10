/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { api, type AccountEnv } from './api'
import { hashToken } from './accounts'
import { dismiss, hiddenArtOf, report, setAvatar } from './db'

let sqlite: DatabaseSync
let env: AccountEnv

beforeEach(async () => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new NodeURL('../migrations/0001_accounts.sql', import.meta.url), 'utf8'))
  sqlite.exec(`INSERT INTO users (id, provider, provider_id, name, name_lc, created, avatar) VALUES
    (1, 'google', 'one', 'One', 'one', 0, 'old'),
    (2, 'google', 'two', 'Two', 'two', 0, 'picture'),
    (3, 'google', 'three', 'Three', 'three', 0, NULL);
    INSERT INTO reports VALUES (2, 1, 0);`)
  sqlite.exec(readFileSync(new NodeURL('../migrations/0006_hidden_art.sql', import.meta.url), 'utf8'))
  sqlite.exec(readFileSync(new NodeURL('../migrations/0007_picture_visibility.sql', import.meta.url), 'utf8'))
  sqlite.prepare('INSERT INTO sessions VALUES (?, 1, ?)').run(await hashToken('test-session'), Date.now() + 60_000)
  const prepare = (sql: string) => {
    const statement = sqlite.prepare(sql)
    const bound = (args: (string | number | null)[] = []) => ({
      bind: (...values: (string | number | null)[]) => bound(values),
      run: async () => ({ meta: { changes: Number(statement.run(...args).changes) } }),
      all: async () => ({ results: statement.all(...args) }),
      first: async () => statement.get(...args) ?? null,
    })
    return bound()
  }
  env = { DB: { prepare, batch: (queries: { run: () => Promise<unknown> }[]) => Promise.all(queries.map((q) => q.run())) } as unknown as D1Database } as AccountEnv
})

afterEach(() => sqlite.close())

const request = (path: string, method = 'GET', body?: unknown, token = 'test-session') => api(new Request(`http://localhost${path}`, {
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
}), env, /^http:\/\/localhost$/)

test('existing reports stay hidden after dismissal or changing the picture', async () => {
  expect(await hiddenArtOf(env.DB, 1)).toEqual([2])
  await dismiss(env.DB, 2)
  await setAvatar(env.DB, 2, 'new')
  expect(await hiddenArtOf(env.DB, 1)).toEqual([2])
  expect(await report(env.DB, 1, 2, 1)).toBe(true)
  expect(await hiddenArtOf(env.DB, 2)).toEqual([1])
  expect(await report(env.DB, 3, 2, 1)).toBe(false)
  expect(await hiddenArtOf(env.DB, 2)).toEqual([1])
})

test('browser imports merge with the account and follow the session to a new device', async () => {
  expect(await (await request('/me/hidden-art', 'POST', { ids: [3, 3, 1, 999] })).json()).toEqual({ hidden: [2, 3], shown: [] })
  expect(await (await request('/me/hidden-art', 'POST', { ids: [] })).json()).toEqual({ hidden: [2, 3], shown: [] })
  expect(await (await request('/me/hidden-art', 'POST', { ids: [] }, '')).status).toBe(401)
  expect((await request('/me/hidden-art', 'POST', { ids: [-1] })).status).toBe(400)
  expect((await request('/me/hidden-art', 'POST', { ids: Array(91).fill(2) })).status).toBe(400)
})

test('showing a picture preserves its report and overrides stale hides from other devices', async () => {
  const choose = (hidden: boolean) => request('/me/hidden-art', 'POST', { ids: [], choices: [{ user: 2, hidden }] })
  expect(await (await choose(false)).json()).toEqual({ hidden: [], shown: [2] })
  expect(sqlite.prepare('SELECT * FROM reports').all()).toHaveLength(1)
  expect(await (await request('/me/hidden-art', 'POST', { ids: [2] })).json()).toEqual({ hidden: [], shown: [2] })
  await report(env.DB, 2, 1, 1)
  expect(await hiddenArtOf(env.DB, 1)).toEqual([])
  expect(await (await choose(true)).json()).toEqual({ hidden: [2], shown: [] })
  expect((await request('/me/hidden-art', 'POST', { ids: [], choices: [{ user: 2, hidden: 'yes' }] })).status).toBe(400)
})

test('a report can keep the picture visible while still reaching the review queue', async () => {
  const response = await request('/report', 'POST', { user: 1, hidden: false })
  expect(response.status).toBe(400)
  sqlite.exec('DELETE FROM reports; DELETE FROM hidden_art;')
  expect((await request('/report', 'POST', { user: 2, hidden: false })).status).toBe(200)
  expect(await hiddenArtOf(env.DB, 1)).toEqual([])
  expect(sqlite.prepare('SELECT * FROM reports WHERE user_id = 2 AND reporter_id = 1').all()).toHaveLength(1)
  expect(await (await request('/me/hidden-art', 'POST', { ids: [2] })).json()).toEqual({ hidden: [], shown: [2] })
})

test('replay lookup returns current pictures and omits deleted users', async () => {
  await setAvatar(env.DB, 2, 'new')
  expect(await (await request('/avatars?ids=2,3,999')).json()).toEqual([{ id: 2, avatar: 'new' }, { id: 3, avatar: null }])
})
