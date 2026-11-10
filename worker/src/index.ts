// The Cloudflare side of a room, kept thin: sockets in, room.ts does the poker, sql.ts saves it.
// One Durable Object per room. Hibernation wipes memory, so everything that matters is in the row.
// Rows written are the free plan's tight limit, so nothing here saves unless the room really changed.

import { DurableObject } from 'cloudflare:workers'
import { PUBLIC_TABLES, type TableInfo } from '../../src/room/public'
import { addressKey, charge, chatText, command, join, newRoom, nextDay, nextWake, openRoom, seatOf, spent, stalled, tick, viewOf, type Command, type Opened as Log, type Room } from './room'
import { loadRoom, saveRoom } from './sql'
import { api, API_PATH, type AccountEnv } from './api'
import { addStats, mutualIds, rate, userBySession } from './db'

interface Env extends AccountEnv {
  TABLE: DurableObjectNamespace<Table>
  OPENED: DurableObjectNamespace<Opened>
  CONNECTS: RateLimit
}

type Attachment = { token: string }

const TOKEN = /^[\w-]{16,64}$/
const ROOM_PATH = /^\/room\/([a-z0-9]{4,16})$/
const TABLE_PATH = /^\/table\/([a-z]+)$/
// public tables are named table-venom and so on. Private codes have no dash, so the two never meet
const PUBLIC_PREFIX = 'table-'
// the live site, and anything served off this machine or the home wifi for testing. A script can
// fake an Origin, this only stops someone else's page opening rooms from its visitors' browsers
const ORIGINS = /^(https:\/\/ponker\.aidanbailey\.com|http:\/\/(localhost|127\.0\.0\.1|10(\.\d+){3}|192\.168(\.\d+){2})(:\d+)?)$/
const MAX_SOCKETS = 12 // six players and a few watching
const CHAT_GAP_MS = 1000
const EMOTE_GAP_MS = 3000
// each socket gets a bucket of messages that refills. Plenty for playing and chatting, nowhere near a loop
const BURST = 12
const REFILL_PER_S = 4
const STRIKES = 5 // dropped before the socket goes. A real client never trips the bucket, and each drop is still a request
const MIN_ALARM_MS = 250 // a floor, so no bug can make the alarm fire back to back
const STUCK_MS = 30_000
const TOO_MANY_ROOMS = 4029

const send = (ws: WebSocket, data: object) => {
  try {
    ws.send(JSON.stringify(data))
  } catch {
    // closing already, the close handler tidies up
  }
}

export class Table extends DurableObject<Env> {
  loaded: Room | null = null
  alarmAt: number | null | undefined // undefined until we know, after a wake
  lastChat = new Map<string, number>()
  lastEmote = new Map<string, number>()
  // the count being asked for a room that's being made, so two first connects at once only count it once
  opening: Promise<boolean> | null = null
  // ponytail: in memory, so a hibernation hands everyone a fresh bucket. Fine, waking takes a quiet spell
  buckets = new Map<WebSocket, { left: number; at: number; strikes: number }>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // answered without waking the object, so the clients' heartbeat costs nothing
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  get room() {
    return (this.loaded ??= loadRoom(this.ctx.storage.sql) ?? newRoom(!!this.ctx.id.name?.startsWith(PUBLIC_PREFIX)))
  }

  // for the public list. Reads, never saves, so a look at an empty table costs a request and no rows
  async status(): Promise<Omit<TableInfo, 'id'>> {
    const room = this.loaded ?? loadRoom(this.ctx.storage.sql)
    const members = room?.members ?? []
    return {
      humans: members.filter((m) => m?.token).length,
      bots: members.filter((m) => m && !m.token).length,
      resting: !!room && spent(room, Date.now()),
    }
  }

  sockets(except?: WebSocket) {
    return this.ctx.getWebSockets().filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN)
  }

  online(except?: WebSocket) {
    return new Set(this.sockets(except).map((ws) => (ws.deserializeAttachment() as Attachment).token))
  }

  broadcast(except?: WebSocket) {
    const online = this.online(except)
    const now = Date.now()
    for (const ws of this.sockets(except)) {
      send(ws, viewOf(this.room, (ws.deserializeAttachment() as Attachment).token, online, now))
    }
  }

  // runs a change and only pays for it if the room came out different
  async change(run: () => void) {
    const before = JSON.stringify(this.room)
    run()
    if (JSON.stringify(this.room) === before) return false
    this.room.seq++
    await this.commit()
    return true
  }

  async commit() {
    const room = this.room
    const now = Date.now()
    // a finished hand's stats go to D1, not into the saved room. Lost if D1 is down, that's fine for stats
    const done = room.done
    delete room.done
    if (done?.length) this.ctx.waitUntil(addStats(this.env.DB, done).catch(() => {}))
    // same for closed rating pairs. A D1 blip loses that block's rating, nobody's worse off for it
    const rated = room.rated
    const played = room.played
    delete room.rated
    delete room.played
    if (rated?.length) this.ctx.waitUntil(rate(this.env.DB, rated, played ?? [], now).catch(() => {}))
    // nobody human left and nobody connected, so there's nothing worth keeping. After the sends above, the last
    // one out gets swept with their socket already gone and their pairs would go with the room
    if (!room.members.some((m) => m?.token) && !this.sockets().length) return this.clear()
    const at = nextWake(room)
    const rearm = at !== this.alarmAt
    charge(room, rearm ? 2 : 1, now)
    saveRoom(this.ctx.storage.sql, room)
    this.broadcast()
    if (rearm) await this.arm(at, now)
  }

  async arm(at: number | null, now: number) {
    if (at === null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(Math.max(at, now + MIN_ALARM_MS))
    this.alarmAt = at
  }

  async clear() {
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    this.loaded = null
    this.alarmAt = null
  }

  // false means drop it. Too many drops and the socket goes, the client's backoff slows it right down
  allowed(ws: WebSocket, now: number) {
    const bucket = this.buckets.get(ws) ?? { left: BURST, at: now, strikes: 0 }
    bucket.left = Math.min(BURST, bucket.left + ((now - bucket.at) / 1000) * REFILL_PER_S)
    bucket.at = now
    this.buckets.set(ws, bucket)
    if (bucket.left >= 1) {
      bucket.left--
      return true
    }
    if (++bucket.strikes > STRIKES) ws.close(4008, 'too fast')
    return false
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    const token = url.searchParams.get('token') ?? ''
    if (!TOKEN.test(token)) return new Response('bad token', { status: 400 })
    // signed in, they're the account wherever they connect from. u:<id> can't be sent as a guest token, TOKEN has no colon.
    // A session that's run out just falls back to the guest
    const session = url.searchParams.get('session')
    const user = session ? await userBySession(this.env.DB, session, Date.now()) : null
    const who = user ? `u:${user.id}` : token
    // a socket lost with no close frame still looks open here, so the newest one for a token wins.
    // 4000 tells the old tab it was replaced and not to fight back
    for (const old of this.sockets()) {
      if ((old.deserializeAttachment() as Attachment).token === who) old.close(4000, 'replaced')
    }
    if (this.sockets().length >= MAX_SOCKETS) return new Response('room is full', { status: 503 })
    // a private room nobody has open yet is being made. Only that costs a look at the address's count,
    // joining one that's going never does. A browser can't read a refused upgrade, so it gets a socket
    // that says why and closes
    const isPublic = !!this.ctx.id.name?.startsWith(PUBLIC_PREFIX)
    if (!isPublic && !this.loaded && !loadRoom(this.ctx.storage.sql)) {
      const ip = request.headers.get('cf-connecting-ip') ?? 'local'
      const asking = (this.opening ??= this.env.OPENED.getByName(addressKey(ip)).open())
      let allowed
      try {
        allowed = await asking
      } finally {
        if (this.opening === asking) this.opening = null
      }
      if (!allowed) {
        const { 0: client, 1: server } = new WebSocketPair()
        server.accept()
        server.close(TOO_MANY_ROOMS, 'enough rooms today')
        return new Response(null, { status: 101, webSocket: client })
      }
    }
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ token: who } satisfies Attachment)
    // a returning seat with the same name changes nothing, so it only costs a broadcast
    const changed = await this.change(() =>
      join(this.room, who, user?.name ?? url.searchParams.get('name') ?? '', Date.now(), user && { user: user.id, art: user.avatar }),
    )
    if (!changed) this.broadcast()
    // the chat so far, only to the one who just arrived
    send(server, { t: 'chat', lines: this.room.chat })
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const now = Date.now()
    if (!this.allowed(ws, now)) return
    if (typeof message !== 'string' || message.length > 1000) return
    const { token } = ws.deserializeAttachment() as Attachment
    let cmd: Command
    try {
      cmd = JSON.parse(message)
    } catch {
      return
    }

    if ((cmd as { t: string }).t === 'stats') return send(ws, { t: 'stats', ...this.room.stats })
    if (cmd.t === 'chat') {
      if (now - (this.lastChat.get(token) ?? 0) < CHAT_GAP_MS) return send(ws, { t: 'nope', why: 'slow down' })
      this.lastChat.set(token, now)
    }
    if (cmd.t === 'emote') {
      if (now - (this.lastEmote.get(token) ?? 0) < EMOTE_GAP_MS) return
      this.lastEmote.set(token, now)
    }

    let kind
    const before = JSON.stringify(this.room)
    try {
      kind = command(this.room, token, cmd, now)
    } catch (e) {
      // the client was a beat behind, it gets the real state back. Only on a reply it's owed, a
      // stream of junk just gets dropped by the bucket
      send(ws, { t: 'nope', why: (e as Error).message })
      return send(ws, viewOf(this.room, token, this.online(), now))
    }
    // never saved, so emotes cost no rows. Someone who arrives a second later just misses it
    if (kind === 'emote') {
      const seat = seatOf(this.room, token)
      for (const other of this.sockets()) send(other, { t: 'emote', seat, i: (cmd as { i: number }).i })
      return
    }
    // only the sender and their mutual friends here. One D1 read a line, and chat's already held to one a second
    if (kind === 'friendchat') {
      const seat = seatOf(this.room, token)
      const m = this.room.members[seat]!
      const line = { name: m.name, text: chatText((cmd as { text: string }).text), at: now, seat, user: m.user, art: m.art }
      const friends = new Set((await mutualIds(this.env.DB, m.user!)).map((id) => `u:${id}`))
      for (const other of this.sockets()) {
        const to = (other.deserializeAttachment() as Attachment).token
        if (to === token || friends.has(to)) send(other, { t: 'chat', lines: [line] })
      }
      return
    }
    if (kind === 'chat') {
      charge(this.room, 1, now)
      saveRoom(this.ctx.storage.sql, this.room)
      for (const other of this.sockets()) send(other, { t: 'chat', lines: this.room.chat.slice(-1) })
      return
    }
    // an I'm back when you're already in, a leave twice. Nothing to pay for
    if (JSON.stringify(this.room) === before) return
    this.room.seq++
    await this.commit()
  }

  async alarm(info?: AlarmInvocationInfo) {
    this.alarmAt = null
    const now = Date.now()
    const due = nextWake(this.room)
    if ((due !== null && now - due > 1000) || info?.isRetry) {
      console.warn('Table alarm delayed', {
        table: this.ctx.id.name ?? this.ctx.id.toString(),
        lateMs: due === null ? null : Math.round(now - due),
        scheduledLateMs: info ? now - info.scheduledTime : null,
        retryCount: info?.retryCount ?? 0,
        hand: this.room.hand,
        street: this.room.table.street,
        acts: this.room.stats.actions,
        bot: !!this.room.turn?.bot,
      })
    }
    const changed = await this.change(() => tick(this.room, now, this.online()))
    if (changed) return
    // woke early or for nothing, still keep the next one set. One that's already due after a wake
    // that did nothing is a bug, and spinning on it is what burns the day's allowance, so back off
    const next = nextWake(this.room)
    const stuck = next !== null && next <= now
    if (stuck) console.warn('Table alarm made no progress', {
      table: this.ctx.id.name ?? this.ctx.id.toString(),
      lateMs: Math.round(now - next),
      hand: this.room.hand,
      street: this.room.table.street,
      acts: this.room.stats.actions,
      bot: !!this.room.turn?.bot,
    })
    const at = stuck ? now + STUCK_MS : next
    if (at !== null) charge(this.room, 1, now)
    await this.arm(at, now)
  }

  // who's away comes from the sockets, so usually nothing to save. A public table that isn't dealing
  // starts the grace for whoever's gone, or their seat would sit there forever
  async webSocketClose(ws: WebSocket) {
    this.buckets.delete(ws)
    const online = this.online(ws)
    if (await this.change(() => stalled(this.room, online, Date.now()))) return
    // the last one to press Leave saved while their socket was still open, so commit() kept the room
    if (!this.room.members.some((m) => m?.token) && !this.sockets(ws).length) return this.clear()
    this.broadcast(ws)
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws)
  }
}

// one per address, counting the private rooms it's opened today. Costs a row for each room it lets through,
// and one more on the day's first for the alarm that wipes it, so no address is kept past its day
export class Opened extends DurableObject<Env> {
  async open() {
    const now = Date.now()
    const next = openRoom(await this.ctx.storage.get<Log>('log'), now)
    if (!next) return false
    await this.ctx.storage.put('log', next)
    if (next.rooms === 1) await this.ctx.storage.setAlarm(nextDay(now))
    return true
  }

  async alarm() {
    await this.ctx.storage.deleteAll()
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname
    if (API_PATH.test(path)) {
      const origin = request.headers.get('Origin')
      if (origin && !ORIGINS.test(origin)) return new Response('not from here', { status: 403 })
      const { success } = await env.CONNECTS.limit({ key: `api:${request.headers.get('cf-connecting-ip') ?? 'local'}` })
      if (!success) return new Response('slow down', { status: 429, headers: origin ? { 'Access-Control-Allow-Origin': origin } : {} })
      return api(request, env, ORIGINS)
    }
    const list = path === '/tables'
    const pub = path.match(TABLE_PATH)?.[1]
    const name = path.match(ROOM_PATH)?.[1] ?? (pub && PUBLIC_TABLES.includes(pub) ? PUBLIC_PREFIX + pub : null)
    if (!name && !list) return new Response('not found', { status: 404 })
    if (!list && request.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 })
    const origin = request.headers.get('Origin')
    if (origin && !ORIGINS.test(origin)) return new Response('not from here', { status: 403 })
    // per address, before the room ever wakes. Covers reconnect loops, minting rooms by the thousand,
    // and hammering the list, which wakes all four tables each time. The list counts on its own, so
    // mashing Refresh can't stop you sitting down
    const ip = request.headers.get('cf-connecting-ip') ?? 'local'
    const { success } = await env.CONNECTS.limit({ key: list ? `list:${ip}` : ip })
    // the page can only read a reply that allows its origin, or a 429 just looks like the network failed
    const cors = { 'Access-Control-Allow-Origin': origin ?? '*' }
    if (!success) return new Response('slow down', { status: 429, headers: list ? cors : {} })
    if (list) {
      const tables = await Promise.all(
        PUBLIC_TABLES.map(async (id) => ({ id, ...(await env.TABLE.getByName(PUBLIC_PREFIX + id).status()) })),
      )
      return Response.json(tables, { headers: cors })
    }
    return env.TABLE.getByName(name!).fetch(request)
  },
} satisfies ExportedHandler<Env>
