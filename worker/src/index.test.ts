import { afterEach, describe, expect, test, vi } from 'vitest'
import { command, join, newRoom, nextWake, tick, BANK_MS } from './room'

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))

import { Table } from './index'

const A = 'token-aaaaaaaaaaaaaaaa'
const B = 'token-bbbbbbbbbbbbbbbb'
const online = new Set([A, B])

function table(withBot = false) {
  const room = newRoom()
  join(room, A, 'Ann', 0)
  if (withBot) command(room, A, { t: 'addBot' }, 0)
  else join(room, B, 'Bob', 0)
  tick(room, nextWake(room)!, online)
  const instance = Object.create(Table.prototype) as Table
  Object.defineProperty(instance, 'ctx', { value: { id: { name: 'table-phantom' } } })
  instance.loaded = room
  instance.online = () => online
  instance.commit = vi.fn(async () => {})
  return instance
}

afterEach(() => vi.restoreAllMocks())

describe('table alarm timing', () => {
  test('an on-time human turn still gets its full bank without a delay warning', async () => {
    const t = table()
    const ends = t.room.turn!.ends
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Date, 'now').mockReturnValue(ends)
    await t.alarm({ isRetry: false, retryCount: 0, scheduledTime: ends })
    expect(t.room.turn).toMatchObject({ ends: ends + BANK_MS, banked: true })
    expect(warn).not.toHaveBeenCalled()
    expect(t.commit).toHaveBeenCalledOnce()
  })

  test('a late alarm reports its lateness without taking time from the human bank', async () => {
    const t = table()
    const ends = t.room.turn!.ends
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Date, 'now').mockReturnValue(ends + 10_000)
    await t.alarm()
    expect(warn).toHaveBeenCalledWith('Table alarm delayed', expect.objectContaining({ lateMs: 10_000, retryCount: 0, bot: false }))
    expect(t.room.turn).toMatchObject({ ends: ends + 10_000 + BANK_MS, banked: true })
  })

  test('a retry is reported even when the next deadline is still in the future', async () => {
    const t = table()
    const ends = t.room.turn!.ends
    const acts = t.room.stats.actions
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    t.arm = vi.fn(async () => {})
    vi.spyOn(Date, 'now').mockReturnValue(ends - 100)
    await t.alarm({ isRetry: true, retryCount: 2, scheduledTime: ends - 6000 })
    expect(warn).toHaveBeenCalledWith('Table alarm delayed', expect.objectContaining({ lateMs: -100, retryCount: 2 }))
    expect(t.arm).toHaveBeenCalledWith(ends, ends - 100)
    expect(t.commit).not.toHaveBeenCalled()
    // Rearming still charges the existing one row, without advancing the hand.
    expect(t.room.stats.actions).toBe(acts)
    expect(t.room.turn!.ends).toBe(ends)
  })

  test('a late bot alarm is distinguishable from a human timeout and plays only one action', async () => {
    const t = table(true)
    command(t.room, A, { t: 'act', action: { type: 'call' } }, 2000)
    expect(t.room.turn?.bot).toBeDefined()
    const ends = t.room.turn!.ends
    const acts = t.room.stats.actions
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Date, 'now').mockReturnValue(ends + 10_000)
    await t.alarm()
    expect(warn).toHaveBeenCalledWith('Table alarm delayed', expect.objectContaining({ lateMs: 10_000, bot: true }))
    expect(t.room.stats.actions).toBe(acts + 1)
    expect(t.commit).toHaveBeenCalledOnce()
  })
})
