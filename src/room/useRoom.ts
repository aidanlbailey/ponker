// The socket to one room. Sockets drop with no warning, sometimes with no close frame at all, so
// this never trusts one: it pings, and anything quiet for too long gets replaced. Every connect
// gets the whole table back, so a reconnect is just a fresh start.

import { useEffect, useRef, useState } from 'react'
import { load, save } from '../lib/storage'
import type { ChatLine, Command, RoomView } from '../../worker/src/room'

export type { ChatLine, RoomView }

const BASE = import.meta.env.VITE_ROOMS_URL ?? `ws://${location.hostname}:8787`
const PING_MS = 5000
const DEAD_MS = 12_000 // two pings with no pong
const CONNECT_MS = 6000 // a handshake that's taken this long isn't coming
const WAKE_CHECK_MS = 3000
const MAX_RETRY_MS = 8000
const TURN_MS = 20_000 // keep in step with worker/src/room.ts
const CHAT_KEPT = 30

export const ROOM_ID = /^[a-z0-9]{8,16}$/

// getRandomValues and not randomUUID, which only exists on https, and a phone on the wifi is plain http
const randomText = (length: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => (b % 36).toString(36)).join('')

export const newRoomId = () => randomText(10)

// a guest's seat is held against this, so it has to outlive the tab
export function guestToken() {
  let token = load('ponker-guest', '')
  if (!/^[\w-]{16,64}$/.test(token)) {
    token = randomText(32)
    save('ponker-guest', token)
  }
  return token
}

export type Incoming = { view: RoomView; fresh: boolean }
export type Clock = { seat: number; ms: number; of: number; banked: boolean; key: number }

export function useRoom(id: string, name: string) {
  const [status, setStatus] = useState<'connecting' | 'open' | 'lost' | 'replaced'>('connecting')
  const [tries, setTries] = useState(0)
  const [first, setFirst] = useState<RoomView | null>(null)
  const [latest, setLatest] = useState<RoomView | null>(null)
  const [clock, setClock] = useState<Clock | null>(null)
  const [chat, setChat] = useState<ChatLine[]>([])
  const [version, setVersion] = useState(0)
  const queue = useRef<Incoming[]>([])
  const socket = useRef<WebSocket | null>(null)
  const reconnect = useRef(() => {})

  useEffect(() => {
    let ws: WebSocket | null = null
    let retry = 0
    let attempt = 0
    let heard = 0
    let fresh = true // the next state is a full resync, not a step
    let freshChat = true
    let stopped = false
    let parked = false // this tab got replaced by another, it waits to be asked back

    const drop = () => {
      if (!ws) return
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
      ws.close()
      ws = socket.current = null
    }

    const connect = () => {
      parked = false
      drop()
      clearTimeout(retry)
      const url = `${BASE}/room/${id}?token=${encodeURIComponent(guestToken())}&name=${encodeURIComponent(name)}`
      const next = (ws = socket.current = new WebSocket(url))
      heard = performance.now()
      setStatus((prev) => (prev === 'open' ? 'lost' : prev))
      next.onopen = () => {
        attempt = 0
        fresh = freshChat = true
        setTries(0)
        setStatus('open')
      }
      next.onmessage = ({ data }) => {
        heard = performance.now()
        if (data === 'pong') return
        const msg = JSON.parse(data as string)
        if (msg.t === 'state') {
          const view = msg as RoomView
          queue.current.push({ view, fresh })
          fresh = false
          setFirst((prev) => prev ?? view)
          setLatest(view)
          setClock(
            view.turn && {
              seat: view.turn.seat,
              ms: view.turn.ms,
              of: view.turn.banked ? view.turn.ms : TURN_MS,
              banked: view.turn.banked,
              key: view.acts * 2 + (view.turn.banked ? 1 : 0),
            },
          )
          setVersion((n) => n + 1)
        } else if (msg.t === 'chat') {
          const lines = msg.lines as ChatLine[]
          setChat((prev) => (freshChat ? lines : [...prev, ...lines].slice(-CHAT_KEPT)))
          freshChat = false
        } else if (msg.t === 'nope') {
          // we were a step behind, the state that follows puts us right
          fresh = true
        }
      }
      next.onclose = next.onerror = (e) => {
        if (stopped) return
        drop()
        if ((e as CloseEvent).code === 4000) {
          parked = true
          return setStatus('replaced')
        }
        setStatus('lost')
        setTries((n) => n + 1)
        retry = window.setTimeout(connect, Math.min(500 * 2 ** attempt++, MAX_RETRY_MS))
      }
    }

    // checks a socket that says it's open is really there. Pongs come back without waking the room.
    // One still connecting gets the same deadline, with no signal it can hang there for good
    const check = (within: number) => {
      if (parked || !ws || ws.readyState > WebSocket.OPEN) return
      const open = ws.readyState === WebSocket.OPEN
      if (performance.now() - heard > (open ? within : CONNECT_MS)) return connect()
      if (open) ws.send('ping')
    }
    const beat = window.setInterval(() => check(DEAD_MS), PING_MS)

    // back from a pocket or a tunnel: ask now rather than wait for the next beat
    const wake = () => {
      if (parked || document.visibilityState !== 'visible') return
      if (!ws || ws.readyState !== WebSocket.OPEN) return connect()
      const asked = performance.now()
      ws.send('ping')
      window.setTimeout(() => heard < asked && connect(), WAKE_CHECK_MS)
    }
    addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)

    reconnect.current = connect
    connect()
    return () => {
      stopped = true
      clearInterval(beat)
      clearTimeout(retry)
      removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
      drop()
    }
  }, [id, name])

  const send = (cmd: Command) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(cmd))
  }

  return { status, tries, first, latest, clock, chat, version, queue, send, reconnect: () => reconnect.current() }
}

export type RoomSocket = ReturnType<typeof useRoom>
