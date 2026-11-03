// Milestone 1 spike. Throwaway: proves hibernation and measures cost, then the
// real table replaces it.

import { DurableObject } from 'cloudflare:workers'
import { monteCarloEquity, tableDecision } from './botBench'

interface Env {
  TABLE: DurableObjectNamespace<TestTable>
  PROBE_KEY: string
}

type Seat = { seat: number }

// roughly what a 6-max table has to save after each action
const blankState = () => ({
  actions: 0,
  alarms: 0,
  left: 0,
  seats: Array.from({ length: 6 }, (_, i) => ({
    id: `player-${i}-${'x'.repeat(32)}`,
    name: `Player ${i}`,
    stack: 10000,
    bet: 0,
    hole: [0, 0],
    avatar: 'a'.repeat(300),
  })),
  board: [0, 0, 0, 0, 0],
  deck: Array.from({ length: 52 }, (_, i) => i),
  pots: [0],
})

// tiny spot both bench modes share: top pair on a flop against five players
const HERO = [50, 45]
const BOARD = [51, 20, 9]

export class TestTable extends DurableObject<Env> {
  // memory only on purpose. A new id on a later reply means the object was wiped
  instance = crypto.randomUUID().slice(0, 8)
  bootedAt = Date.now()
  handled = 0
  state: ReturnType<typeof blankState> | null = null
  lastRows = { read: 0, written: 0 }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, json TEXT NOT NULL)')
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  load() {
    if (this.state) return this.state
    const row = this.ctx.storage.sql.exec<{ json: string }>('SELECT json FROM state WHERE id = 1').toArray()[0]
    return (this.state = row ? JSON.parse(row.json) : blankState())!
  }

  save() {
    const cursor = this.ctx.storage.sql.exec(
      'INSERT INTO state (id, json) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json',
      JSON.stringify(this.state),
    )
    cursor.toArray()
    this.lastRows = { read: cursor.rowsRead, written: cursor.rowsWritten }
  }

  snapshot(ws?: WebSocket) {
    return {
      instance: this.instance,
      upMs: Date.now() - this.bootedAt,
      handled: this.handled,
      sockets: this.ctx.getWebSockets().length,
      seat: (ws?.deserializeAttachment() as Seat | null)?.seat,
      actions: this.load().actions,
      alarms: this.load().alarms,
      left: this.load().left,
      rows: this.lastRows,
      stateBytes: JSON.stringify(this.state).length,
    }
  }

  broadcast(event: string, except?: WebSocket) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except) ws.send(JSON.stringify({ event, ...this.snapshot(ws) }))
    }
  }

  async fetch(request: Request) {
    const { 0: client, 1: server } = new WebSocketPair()
    const seat = Number(new URL(request.url).searchParams.get('seat') ?? 0)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ seat } satisfies Seat)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    this.handled++
    const msg = JSON.parse(message as string) as { t: string; n?: number; ms?: number; id?: number }
    const reply = (extra: object) => ws.send(JSON.stringify({ id: msg.id, ...this.snapshot(ws), ...extra }))

    if (msg.t === 'hello') return reply({})

    if (msg.t === 'act') {
      this.load().actions++
      this.save()
      reply({})
      return this.broadcast('action', ws)
    }

    if (msg.t === 'timer') {
      await this.ctx.storage.setAlarm(Date.now() + msg.ms!)
      return reply({ alarmIn: msg.ms })
    }

    if (msg.t === 'bench-table') {
      const results: string[] = []
      for (let i = 0; i < msg.n!; i++) results.push(tableDecision(HERO, BOARD, 100 + i, 50))
      return reply({ answer: results[0] })
    }

    if (msg.t === 'bench-mc') return reply({ answer: monteCarloEquity(HERO, BOARD, 5, msg.n!) })
  }

  // the real 20 second turn clock needs this to fire and reach sockets from hibernation
  async alarm() {
    this.load().alarms++
    this.save()
    this.broadcast('alarm')
  }

  async webSocketClose() {
    this.load().left++
    this.save()
    this.broadcast('left')
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    // ponytail: shared key is enough for a throwaway endpoint that burns CPU on demand
    if (url.searchParams.get('key') !== env.PROBE_KEY) return new Response('nope', { status: 403 })
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 })
    return env.TABLE.getByName(url.searchParams.get('table') ?? 'test').fetch(request)
  },
} satisfies ExportedHandler<Env>
