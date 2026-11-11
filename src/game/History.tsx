import { useEffect, useEffectEvent, useState } from 'react'
import { Screen } from '../hub/Previews'
import { isRed, rankText, suitText } from './cards'
import { Table } from './Game'
import { finished, loadHands, netOf, type Hand } from './handLog'
import { useStage, type TableGame } from './useStage'
import type { Card } from '../engine/engine'
import { call } from '../lib/account'
import { useHiddenArt } from '../hooks/useHiddenArt'
import './history.css'

const PLAY_MS = 700 // a pause between steps once the last one's done moving

export default function History({ id }: { id?: number }) {
  const [hands] = useState(loadHands)
  const hand = id === undefined ? undefined : hands.find((h) => h.id === id)
  if (hand) return <Replay key={hand.id} hand={hand} />
  return <List hands={hands.filter(finished)} />
}

function Cards({ cards }: { cards: Card[] }) {
  return (
    <span className="history-cards">
      {cards.map((card) => (
        <span key={card} className={isRed(card) ? 'red' : undefined}>
          {rankText(card)}
          {suitText(card)}
        </span>
      ))}
    </span>
  )
}

const when = (at: number) => {
  const mins = Math.round((Date.now() - at) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`
  return new Date(at).toLocaleDateString()
}

function List({ hands }: { hands: Hand[] }) {
  return (
    <Screen title="Hand history" back={['#profile', 'Profile']}>
      {!hands.length ? (
        <p className="preview-loading">No hands yet. Play a few and they'll be here.</p>
      ) : (
        <ul className="preview-list history-list">
          {hands.map((hand) => {
            const end = hand.steps.at(-1)!.table
            const net = netOf(hand)
            return (
              <li key={hand.id}>
                <Cards cards={hand.steps[0]!.table.seats[hand.me]?.cards ?? []} />
                <span className="history-where">
                  {hand.where} · {when(hand.id)}
                  <br />
                  {end.board.length ? <Cards cards={end.board} /> : 'no flop'}
                </span>
                <b className={net > 0 ? 'won' : net < 0 ? 'lost' : undefined}>
                  {net > 0 ? '+' : ''}
                  {net.toLocaleString('en-US')}
                </b>
                <a className="poker-toggle poker-link" href={`#history/${hand.id}`}>
                  Replay
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </Screen>
  )
}

// Going back starts the table over at the earlier step, the same as a room reconnect does. Resetting in place
// left the later steps' Call and Bet labels sitting on the seats
function Replay({ hand }: { hand: Hand }) {
  const [start, setStart] = useState({ at: -1, epoch: 0, playing: true })
  const hidden = useHiddenArt()
  const [pictures, setPictures] = useState<Record<number, string | null>>({})
  useEffect(() => {
    const ids = [...new Set(hand.users?.filter((id): id is number => id !== null) ?? [])]
    if (!ids.length) return
    let active = true
    const refresh = () => {
      void call<{ id: number; avatar: string | null }[]>(`/avatars?ids=${ids.join(',')}`).then((rows) => {
        if (active) setPictures(Object.fromEntries(rows.map((r) => [r.id, r.avatar])))
      }, () => { if (active) setPictures({}) })
    }
    refresh()
    addEventListener('focus', refresh)
    return () => { active = false; removeEventListener('focus', refresh) }
  }, [hand])
  const arts = hand.names.map((_, seat) => {
    const user = hand.users?.[seat]
    return user && !hidden.includes(user) ? pictures[user] ?? null : null
  })
  return (
    <Player
      key={start.epoch}
      hand={hand}
      arts={arts}
      start={start.at}
      autoplay={start.playing}
      jump={(at, playing) => setStart((prev) => ({ at, epoch: prev.epoch + 1, playing }))}
    />
  )
}

type PlayerProps = { hand: Hand; arts: (string | null)[]; start: number; autoplay: boolean; jump: (at: number, playing: boolean) => void }

// The real table, stepped through the recorded states with the same staging a live hand uses
function Player({ hand, arts, start, autoplay, jump }: PlayerProps) {
  const [at, setAt] = useState(start) // -1 is the table before the deal
  const [playing, setPlaying] = useState(autoplay)
  const table = at < 0 ? hand.before : hand.steps[at]!.table
  const stage = useStage(table, hand.me, false, () => {}, false)
  const last = hand.steps.length - 1

  const forward = () => {
    const step = hand.steps[at + 1]
    if (!step) return
    // skipping on while chips are still flying just lands everything where it ends up
    if (!step.action || stage.busy) stage.reset(step.table)
    else if (step.action.type === 'deal') stage.dealt(step.table)
    else stage.acted(step.table, step.action, step.seat!)
    setAt(at + 1)
  }

  const back = () => at >= 0 && jump(at - 1, false)

  // play just runs out at the end, Again starts it over
  const running = playing && at < last
  const tick = useEffectEvent(forward)
  useEffect(() => {
    if (!running || stage.busy) return
    const timer = setTimeout(tick, PLAY_MS)
    return () => clearTimeout(timer)
  }, [running, stage.busy, at])

  const game: TableGame = {
    ...stage,
    // nothing to press, it's already happened. shown only drives the Show cards button, so marking it keeps that away
    view: {
      ...stage.view,
      toAct: -1,
      seats: stage.view.seats.map((seat, i) => (seat && i === hand.me ? { ...seat, shown: true } : seat)),
    },
    me: hand.me,
    act: () => {},
    nameOf: (seat) => hand.names[seat] ?? 'Player',
    artOf: (seat) => arts[seat] ?? null,
    topUp: false,
    leave: () => (location.hash = '#history'),
  }

  const dock = (
    <div key="replay" className="bet-actions history-controls">
      <button className="button neutral" onClick={back} disabled={at < 0} aria-label="Step back">
        ‹
      </button>
      <button
        className="button primary"
        onClick={() => (at >= last ? jump(-1, true) : setPlaying(!playing))}
      >
        {at >= last ? 'Again' : running ? 'Pause' : 'Play'}
      </button>
      <button className="button neutral" onClick={() => (setPlaying(false), forward())} disabled={at >= last} aria-label="Step forward">
        ›
      </button>
    </div>
  )

  return (
    <Table
      game={game}
      name={hand.names[hand.me] ?? 'You'}
      bar={<span className="poker-stakes">{hand.where}</span>}
      dock={dock}
    />
  )
}
