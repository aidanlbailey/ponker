// The socket to one room. Sockets drop with no warning, sometimes with no close frame at all, so
// this never trusts one: it pings, and anything quiet for too long gets replaced. Every connect
// gets the whole table back, so a reconnect is just a fresh start.

import { useEffect, useRef, useState } from 'react'
import { session } from '../lib/account'
import { load, save } from '../lib/storage'
import { sound } from '../lib/sound'
import type { ChatLine, Command, RoomView } from '../../worker/src/room'
import { EMOTES, type TableInfo } from './public'

export type { ChatLine, RoomView }

const BASE = import.meta.env.VITE_ROOMS_URL || `ws://${location.hostname}:8787`
const PING_MS = 5000
const DEAD_MS = 12_000 // two pings with no pong
const CONNECT_MS = 6000 // a handshake that's taken this long isn't coming
const WAKE_CHECK_MS = 3000
// a room that's down for the day shouldn't have every open tab knocking every few seconds
const MAX_RETRY_MS = 30_000
const TURN_MS = 20_000 // keep in step with worker/src/room.ts
const CHAT_KEPT = 30
const EMOTE_MS = 2600 // the bubble's animation
// a line gets a bit longer to read the more there is of it
export const sayMs = (text: string) => Math.min(6000, EMOTE_MS + 40 * text.length)

export const ROOM_ID = /^[a-z0-9]{4,16}$/

// getRandomValues and not randomUUID, which only exists on https, and a phone on the wifi is plain http
const randomText = (length: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => (b % 36).toString(36)).join('')

// no 0 o 1 l i, so a code read off a screen or said out loud comes out right. Typed ones are still
// let through, older codes have them
const CODE_LETTERS = '23456789abcdefghjkmnpqrstuvwxyz'
// ponytail: 4 of those is about 920k rooms, so a link can be guessed. Fine among friends, lengthen it if strangers turn up
export const newRoomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('')

// a guest's seat is held against this, so it has to outlive the tab
export function guestToken() {
  let token = load('ponker-guest', '')
  if (!/^[\w-]{16,64}$/.test(token)) {
    token = randomText(32)
    save('ponker-guest', token)
  }
  return token
}

// the four public tables and who's at them. Throws if the worker can't be reached or says no
export async function listTables(): Promise<TableInfo[]> {
  const res = await fetch(`${BASE.replace(/^ws/, 'http')}/tables`)
  if (!res.ok) throw new Error(String(res.status))
  return res.json()
}

export type Incoming = { view: RoomView; fresh: boolean; receivedAt: number }
export type Clock = { seat: number; ms: number; of: number; banked: boolean; key: number }

// path is room/<code> or table/<name>
export function useRoom(path: string, name: string) {
  const [status, setStatus] = useState<'connecting' | 'open' | 'lost' | 'replaced' | 'limit'>('connecting')
  const [tries, setTries] = useState(0)
  const [first, setFirst] = useState<RoomView | null>(null)
  const [latest, setLatest] = useState<RoomView | null>(null)
  const [clock, setClock] = useState<Clock | null>(null)
  const [chat, setChat] = useState<ChatLine[]>([])
  const [chatReceived, setChatReceived] = useState(0)
  const [said, setSaid] = useState<Record<number, { text: string; key: number; ms?: number }>>({})
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
    let mySeat: number | null = null
    let stopped = false
    let parked = false // this tab got replaced by another, it waits to be asked back
    const fading = new Set<number>()
    const say = (seat: number, text: string, ms: number) => {
      const key = performance.now()
      setSaid((prev) => ({ ...prev, [seat]: { text, key, ...(ms !== EMOTE_MS && { ms }) } }))
      const timer = window.setTimeout(() => {
        fading.delete(timer)
        setSaid((prev) => (prev[seat]?.key === key ? { ...prev, [seat]: undefined! } : prev))
      }, ms)
      fading.add(timer)
    }

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
      // signed in, the worker takes the name and picture from the account
      const signedIn = session()
      const url = `${BASE}/${path}?token=${encodeURIComponent(guestToken())}&name=${encodeURIComponent(name)}${signedIn ? `&session=${encodeURIComponent(signedIn)}` : ''}`
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
          mySeat = view.me
          queue.current.push({ view, fresh, receivedAt: performance.now() })
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
          // the backlog on connect is old news, only new lines go up over a seat
          if (!freshChat) for (const l of lines) if (l.seat !== undefined) say(l.seat, l.text, sayMs(l.text))
          if (!freshChat) {
            const received = lines.filter((line) => line.seat === undefined || line.seat !== mySeat).length
            if (received) {
              // History rolls over at 30 lines. The unread count must keep moving after that.
              setChatReceived((count) => count + received)
              sound('chatReceive')
            }
          }
          freshChat = false
        } else if (msg.t === 'emote') {
          const { seat, i } = msg as { seat: number; i: number }
          sound('chatOpen', { volume: 0.6 })
          say(seat, EMOTES[i] ?? '', EMOTE_MS)
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
        // this address has opened its rooms for the day, knocking again won't change that
        if ((e as CloseEvent).code === 4029) {
          parked = true
          return setStatus('limit')
        }
        setStatus('lost')
        setTries((n) => n + 1)
        // a hidden tab waits to be looked at, wake() picks it up then
        retry = window.setTimeout(() => !document.hidden && connect(), Math.min(500 * 2 ** attempt++, MAX_RETRY_MS))
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
    // nobody's watching a hidden tab, so it doesn't ping. Coming back checks straight away
    const beat = window.setInterval(() => !document.hidden && check(DEAD_MS), PING_MS)

    // back from a pocket or a tunnel: ask now rather than wait for the next beat
    const wake = () => {
      if (parked || document.visibilityState !== 'visible') return
      if (!ws || ws.readyState !== WebSocket.OPEN) return connect()
      // nothing was pinged while hidden, so the clock on the last message starts again from here
      const asked = (heard = performance.now())
      ws.send('ping')
      window.setTimeout(() => heard <= asked && connect(), WAKE_CHECK_MS)
    }
    addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)

    reconnect.current = connect
    connect()
    return () => {
      stopped = true
      clearInterval(beat)
      clearTimeout(retry)
      fading.forEach(clearTimeout)
      removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
      drop()
    }
  }, [path, name])

  const send = (cmd: Command) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(cmd))
      if (cmd.t === 'chat') sound('chatSend')
    }
  }

  return { status, tries, first, latest, clock, chat, chatReceived, said, version, queue, send, reconnect: () => reconnect.current() }
}

export type RoomSocket = ReturnType<typeof useRoom>
