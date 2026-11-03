import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '../components/Dialog'
import { applyAction, HIDDEN, type Action, type PlayerAction, type TableState } from '../engine/engine'
import { haptic } from '../lib/haptics'
import { Table } from '../game/Game'
import { BUY_IN } from '../game/solo'
import { useStage, type TableGame } from '../game/useStage'
import { useRoom, type RoomSocket, type RoomView } from './useRoom'
import '../game/game.css'
import './room.css'

// the engine wants a deck to deal the next street from. These never reach the screen
const FILLER = Array<number>(52).fill(HIDDEN)
// a tab that was hidden comes back to a pile of states, past this it just jumps to the last
const MAX_QUEUE = 8
const QUOTA_TRIES = 4

const roomLink = (id: string) => `${location.origin}${location.pathname}#room/${id}`

export default function Room({ id, name, onName }: { id: string; name: string; onName: (name: string) => void }) {
  if (!name) return <NameFirst onName={onName} />
  return <Connected id={id} name={name} />
}

function NameFirst({ onName }: { onName: (name: string) => void }) {
  const [text, setText] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (text.trim()) onName(text.trim().slice(0, 16))
  }
  return (
    <div className="poker room-gate">
      <form className="room-gate-card" onSubmit={submit}>
        <h1>Join the room</h1>
        <label>
          What should the table call you?
          <input autoFocus value={text} maxLength={16} onChange={(e) => setText(e.target.value)} />
        </label>
        <button className="button primary" disabled={!text.trim()}>
          Sit down
        </button>
        <a href="#rooms" className="poker-link">
          Not now
        </a>
      </form>
    </div>
  )
}

function Connected({ id, name }: { id: string; name: string }) {
  const room = useRoom(id, name)
  if (!room.first) {
    return (
      <div className="poker room-gate">
        <p className="room-gate-card" role="status">
          {room.tries >= QUOTA_TRIES ? quotaNote : room.status === 'lost' ? 'Trying to reach the room…' : 'Finding your seat…'}
        </p>
      </div>
    )
  }
  return <RoomTable room={room} first={room.first} id={id} name={name} />
}

const quotaNote = "Can't reach the room. Still trying. If the free servers have used up today's allowance, they're back at 00:00 UTC."

function RoomTable({ room, first, id, name }: { room: RoomSocket; first: RoomView; id: string; name: string }) {
  const [cur, setCur] = useState(first)
  const [chatOpen, setChatOpen] = useState(false)
  const [seen, setSeen] = useState(0)
  const [panel, setPanel] = useState(false)
  const preflown = useRef<number | null>(null)
  const applied = useRef(-1)
  const me = cur.me
  const stage = useStage(cur.table, me, cur.table.street === 'complete', () => {})

  // One state at a time and only with nothing staged, same as solo waits for its bots
  const pump = useEffectEvent(() => {
    const q = room.queue.current
    if (q.length > MAX_QUEUE) q.splice(0, q.length - 1, { ...q.at(-1)!, fresh: true })
    while (q[0] && q[0].view.seq <= applied.current && !q[0].fresh) q.shift()
    const next = q[0]
    if (!next || stage.busy) return
    // marked before anything runs, strict mode runs this twice
    applied.current = next.view.seq
    q.shift()
    const view = next.view
    const step = view.acts - cur.acts
    if (next.fresh || step > 1 || (view.hand !== cur.hand && !view.dealt)) {
      preflown.current = null
      stage.reset(view.table)
    } else if (view.hand !== cur.hand) stage.dealt(view.table)
    else if (step === 1 && view.last) {
      if (preflown.current === view.acts) preflown.current = null
      else stage.acted(view.table, view.last.action as Action, view.last.seat)
    }
    setCur(view)
  })
  // a tick later rather than in the effect itself, each state can kick off a render of its own
  useEffect(() => {
    const timer = setTimeout(pump)
    return () => clearTimeout(timer)
  }, [room.version, stage.busy, cur])

  // Your own move flies the moment you make it, the server just confirms it. Only the chips: a street
  // it closes waits for the real cards
  const act = (action: PlayerAction, from?: DOMRect) => {
    haptic('light')
    if (action.type === 'show') return room.send({ t: 'act', action: { type: 'show' } })
    let predicted: TableState
    try {
      predicted = applyAction({ ...cur.table, deck: FILLER }, action)
    } catch {
      return
    }
    stage.acted(predicted, action, me!, from)
    preflown.current = cur.acts + 1
    const same = predicted.street === cur.table.street
    const shown = same ? predicted : { ...predicted, street: cur.table.street, board: cur.table.board, toAct: -1, result: null }
    setCur({ ...cur, table: shown })
    room.send({ t: 'act', action: { type: action.type, to: action.type === 'raise' ? action.to : undefined } })
  }

  const caughtUp = room.queue.current.length === 0 && cur.seq === room.latest?.seq
  const seat = (i: number) => cur.seats[i]
  const mine = me === null ? null : cur.table.seats[me]
  const unread = chatOpen ? 0 : room.chat.length - seen
  const seated = cur.seats.filter(Boolean).length
  const ready = cur.table.seats.filter((s, i) => s && !s.sittingOut && (s.chips > 0 || cur.seats[i]?.bot)).length

  const game: TableGame = {
    ...stage,
    // nothing you press offline would arrive, so it's nobody's turn until we're back
    view: room.status === 'open' ? stage.view : { ...stage.view, toAct: -1 },
    me,
    act,
    nameOf: (i) => seat(i)?.name ?? 'Player',
    tagOf: (i) => {
      const s = seat(i)
      return s?.bot ? 'Bot' : s?.away ? 'Away' : s?.out ? 'Sat out' : null
    },
    clock: caughtUp ? room.clock : null,
    leaving: false,
    topUp: cur.topUp,
    toggleLeaving: () => {
      room.send({ t: 'leave' })
      location.hash = '#rooms'
    },
  }

  const toAct = cur.table.toAct
  let dock = null
  if (room.status === 'replaced') {
    dock = (
      <div className="bet-actions">
        <p className="dock-wait">This room is open somewhere else</p>
        <button className="button primary" onClick={room.reconnect}>
          Play here
        </button>
      </div>
    )
  } else if (room.status !== 'open') {
    dock = <p className="dock-wait room-lost">{room.tries >= QUOTA_TRIES ? quotaNote : 'Reconnecting…'}</p>
  } else if (me === null) {
    // a seat only comes with a fresh connect, so taking one is just that
    dock =
      seated < 6 ? (
        <div className="bet-actions">
          <p className="dock-wait">You're watching</p>
          <button className="button primary" onClick={room.reconnect}>
            Take a seat
          </button>
        </div>
      ) : (
        <p className="dock-wait">The room is full, so you're watching</p>
      )
  } else if (mine?.sittingOut) {
    dock = (
      <div className="bet-actions">
        <p className="dock-wait">You're sitting out</p>
        <button className="button primary" onClick={() => room.send({ t: 'back' })}>
          I'm back
        </button>
      </div>
    )
  } else if (mine?.chips === 0 && stage.idle) {
    dock = (
      <div className="bet-actions">
        <button className="button primary" disabled={cur.topUp} onClick={() => room.send({ t: 'topUp' })}>
          {cur.topUp ? 'Rebuying next hand' : `Rebuy ${BUY_IN.toLocaleString('en-US')}`}
        </button>
      </div>
    )
  } else if (stage.idle && ready < 2) {
    const why = seated < 2 ? 'Waiting for someone to join' : 'Waiting for another player to sit in'
    dock = <p className="dock-wait">{why}. Share the invite from Room{cur.host ? ', or add a bot there' : ''}.</p>
  } else if (!stage.idle && toAct >= 0 && toAct !== me && !stage.dealing) {
    dock = <p className="dock-wait">{seat(toAct)?.name ?? 'Player'} to act</p>
  }

  const bar = (
    <>
      <button className="poker-toggle room-toggle" onClick={() => setPanel(true)}>
        Room
      </button>
      <button
        className={`poker-toggle ${chatOpen ? 'on' : ''}`}
        aria-pressed={chatOpen}
        onClick={() => {
          setChatOpen(!chatOpen)
          setSeen(room.chat.length)
        }}
      >
        Chat{unread > 0 && <span className="room-unread">{unread}</span>}
      </button>
    </>
  )

  return (
    <Table game={game} name={name} bar={bar} dock={dock}>
      {chatOpen && <Chat room={room} onClose={() => (setChatOpen(false), setSeen(room.chat.length))} />}
      {panel && <RoomPanel id={id} view={cur} send={room.send} onClose={() => setPanel(false)} />}
    </Table>
  )
}

function Chat({ room, onClose }: { room: RoomSocket; onClose: () => void }) {
  const [text, setText] = useState('')
  const list = useRef<HTMLOListElement>(null)

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'end' })
  }, [room.chat])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    room.send({ t: 'chat', text })
    setText('')
  }

  return (
    <section className="room-chat" aria-label="Chat">
      <header>
        <b>Chat</b>
        <button className="poker-toggle" onClick={onClose} aria-label="Close chat">
          ×
        </button>
      </header>
      <ol ref={list}>
        {room.chat.map((line) => (
          <li key={`${line.at}-${line.name}-${line.text}`}>
            <b>{line.name}</b> {line.text}
          </li>
        ))}
        {!room.chat.length && <li className="room-chat-empty">Nothing said yet</li>}
      </ol>
      <form onSubmit={submit}>
        <input aria-label="Message" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Say something" />
        <button className="poker-toggle" disabled={!text.trim() || room.status !== 'open'}>
          Send
        </button>
      </form>
    </section>
  )
}

// invite and, for the host, the bots. Kept off the bar, a phone hasn't the room for both
function RoomPanel({ id, view, send, onClose }: { id: string; view: RoomView; send: RoomSocket['send']; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const bots = view.seats.flatMap((s, i) => (s?.bot ? [{ seat: i, name: s.name }] : []))
  const full = view.seats.every(Boolean)
  const me = view.me === null ? null : view.table.seats[view.me]

  const invite = async () => {
    const url = roomLink(id)
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        return await navigator.share({ title: 'Ponker room', text: 'Pull up a chair', url })
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // nothing to do, the link is in the address bar
    }
  }

  return (
    <Dialog title="This room" className="room-panel" onClose={onClose}>
      {me && me.chips < BUY_IN && (
        <>
          <h2>Your stack</h2>
          <button className={`button ${view.topUp ? 'neutral' : 'primary'}`} onClick={() => send({ t: 'topUp' })}>
            {view.topUp ? `Topping up to ${BUY_IN.toLocaleString('en-US')}, tap to cancel` : `Top up to ${BUY_IN.toLocaleString('en-US')}`}
          </button>
        </>
      )}
      <h2>Invite</h2>
      <p className="room-link">{roomLink(id)}</p>
      <button className="button primary" onClick={invite}>
        {copied ? 'Link copied' : 'Share the link'}
      </button>
      {view.host && (
        <>
          <h2>Bots</h2>
          <ul>
            {bots.map((bot) => (
              <li key={bot.seat}>
                <b>{bot.name}</b>
                <span>Bot</span>
                <button className="poker-toggle" onClick={() => send({ t: 'removeBot', seat: bot.seat })}>
                  Remove
                </button>
              </li>
            ))}
            {!bots.length && <li>No bots yet. They play from the next hand, and leave after the one they're in.</li>}
          </ul>
          <button className="button neutral" disabled={full} onClick={() => send({ t: 'addBot' })}>
            {full ? 'Table is full' : 'Add a random bot'}
          </button>
        </>
      )}
    </Dialog>
  )
}
