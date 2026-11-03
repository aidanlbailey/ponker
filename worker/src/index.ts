// The Cloudflare side of a room, kept thin: sockets in, room.ts does the poker, sql.ts saves it.
// One Durable Object per room. Hibernation wipes memory, so everything that matters is in the row.

import { DurableObject } from 'cloudflare:workers'
import { command, join, newRoom, nextWake, tick, viewOf, type Command, type Room } from './room'
import { loadRoom, saveRoom, setup } from './sql'

interface Env {
  TABLE: DurableObjectNamespace<Table>
}

type Attachment = { token: string }

const CHAT_GAP_MS = 400
const TOKEN = /^[\w-]{16,64}$/

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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    setup(ctx.storage.sql)
    // answered without waking the object, so the clients' heartbeat costs nothing
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  get room() {
    return (this.loaded ??= loadRoom(this.ctx.storage.sql) ?? newRoom())
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

  async commit(except?: WebSocket) {
    const room = this.room
    room.stats.rows += saveRoom(this.ctx.storage.sql, room)
    this.broadcast(except)
    const at = nextWake(room)
    if (at === this.alarmAt) return
    if (at === null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(at)
    this.alarmAt = at
    // the alarm write is a row too. counted on the next save, near enough for a budget
    room.stats.rows++
  }

  async fetch(request: Request) {
    const url = new URL(request.url)
    const token = url.searchParams.get('token') ?? ''
    if (!TOKEN.test(token)) return new Response('bad token', { status: 400 })
    // a socket lost with no close frame still looks open here, so the newest one for a token wins.
    // 4000 tells the old tab it was replaced and not to fight back
    for (const old of this.sockets()) {
      if ((old.deserializeAttachment() as Attachment).token === token) old.close(4000, 'replaced')
    }
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ token } satisfies Attachment)
    join(this.room, token, url.searchParams.get('name') ?? '', Date.now())
    await this.commit()
    // the chat so far, only to the one who just arrived
    send(server, { t: 'chat', lines: this.room.chat })
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== 'string' || message.length > 1000) return
    const { token } = ws.deserializeAttachment() as Attachment
    let cmd: Command
    try {
      cmd = JSON.parse(message)
    } catch {
      return
    }
    const now = Date.now()

    if ((cmd as { t: string }).t === 'stats') return send(ws, { t: 'stats', ...this.room.stats })
    if (cmd.t === 'chat') {
      if (now - (this.lastChat.get(token) ?? 0) < CHAT_GAP_MS) return send(ws, { t: 'nope', why: 'slow down' })
      this.lastChat.set(token, now)
    }

    let kind
    try {
      kind = command(this.room, token, cmd, now)
    } catch (e) {
      // the client was a beat behind, it gets the real state back
      send(ws, { t: 'nope', why: (e as Error).message })
      return send(ws, viewOf(this.room, token, this.online(), now))
    }
    if (kind === 'chat') {
      this.room.stats.rows += saveRoom(this.ctx.storage.sql, this.room)
      for (const other of this.sockets()) send(other, { t: 'chat', lines: this.room.chat.slice(-1) })
      return
    }
    await this.commit()
  }

  async alarm() {
    this.alarmAt = null
    if (tick(this.room, Date.now(), this.online())) await this.commit()
    else {
      // woke early or for nothing, still keep the next one set
      const at = nextWake(this.room)
      if (at !== null) await this.ctx.storage.setAlarm(at)
      this.alarmAt = at
    }
  }

  // nothing to save, who's away comes from the sockets
  async webSocketClose(ws: WebSocket) {
    this.broadcast(ws)
  }

  async webSocketError(ws: WebSocket) {
    this.broadcast(ws)
  }
}

export default {
  async fetch(request, env) {
    const id = new URL(request.url).pathname.match(/^\/room\/([a-z0-9]{8,16})$/)?.[1]
    if (!id) return new Response('not found', { status: 404 })
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 })
    return env.TABLE.getByName(id).fetch(request)
  },
} satisfies ExportedHandler<Env>
