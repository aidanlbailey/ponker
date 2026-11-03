import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Avatar } from '../game/Pieces'
import { pickTable, PUBLIC_TABLES, tableName, type TableInfo } from '../room/public'
import { listTables, newRoomId } from '../room/useRoom'
import '@fontsource-variable/manrope'
import '../game/game.css'
import '../game/picker.css'
import './previews.css'

// The hub's other screens. Quick Play and Rooms are real. Daily Race and Profile are still filler with
// made up data, until milestones 8 and 7 build them

export type PreviewName = 'quick' | 'rooms' | 'race' | 'profile'

const SOON = "Coming soon, this part isn't built yet"

type ScreenProps = { title: string; intro?: string; filler?: boolean; children: (soon: () => void) => ReactNode }

function Screen({ title, intro = 'Preview, everything here is made up', filler = true, children }: ScreenProps) {
  const [note, setNote] = useState(intro)
  return (
    <div className="poker picker preview">
      <header className="poker-bar">
        <a href="#" className="poker-link">
          <span aria-hidden="true">{'‹'}</span> Home
        </a>
        <span className="poker-spacer" />
        <span className="poker-stakes">{title}</span>
        {filler && <span className="preview-tag">Preview</span>}
      </header>
      <main className="picker-body">
        {note && (
          <p className="preview-note" role="status">
            {note}
          </p>
        )}
        {children(() => setNote(SOON))}
      </main>
    </div>
  )
}

const DOWN = "Couldn't load the tables. Try again in a minute."
// listTables throws the status, and 429 is just the per-minute limit
const downText = (e: Error) => (e.message === '429' ? 'Easy on the refresh. Try again in a minute.' : DOWN)

// straight to the busiest table with room, or an empty one where the table offers invite and bots
function QuickPlay() {
  const [state, setState] = useState<'finding' | 'full' | 'down'>('finding')
  const [why, setWhy] = useState(DOWN)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let gone = false
    listTables().then(
      (tables) => {
        if (gone) return
        const table = pickTable(tables)
        // replace, so Back from the table goes home and not to this
        if (table) location.replace(`#table/${table.id}`)
        else setState('full')
      },
      (e) => {
        if (gone) return
        setWhy(downText(e))
        setState('down')
      },
    )
    return () => {
      gone = true
    }
  }, [attempt])

  return (
    <Screen title="Quick Play" intro="" filler={false}>
      {() => (
        <section className="picker-seats">
          {state === 'finding' && <p role="status">Finding you a seat…</p>}
          {state === 'full' && (
            <>
              <h2>Every public table is full</h2>
              <p>Play the bots on your own, or open a private room and send friends the link.</p>
              <div className="picker-actions">
                <a className="button neutral" href="#rooms">
                  Private room
                </a>
                <a className="button primary" href="#bots">
                  Play bots
                </a>
              </div>
            </>
          )}
          {state === 'down' && (
            <>
              <p role="status">{why}</p>
              <div className="picker-actions">
                <button className="button primary" onClick={() => (setState('finding'), setAttempt((n) => n + 1))}>
                  Try again
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </Screen>
  )
}

function seatedText(t: TableInfo) {
  if (t.resting) return 'Resting till 00:00 UTC'
  if (!t.humans) return 'Empty'
  return `${t.humans} playing${t.bots ? `, ${t.bots} ${t.bots === 1 ? 'bot' : 'bots'}` : ''}`
}

// a pasted link or just the code on the end of it
const roomIn = (text: string) => {
  const t = text.trim().toLowerCase()
  const pub = t.match(/table\/([a-z]+)\/?$/)?.[1]
  if (pub && PUBLIC_TABLES.includes(pub)) return `table/${pub}`
  const code = t.match(/([a-z0-9]{4,16})\/?$/)?.[1]
  return code && `room/${code}`
}

function Rooms() {
  const [link, setLink] = useState('')
  // null while loading. No polling, each look wakes all four tables
  // a string is why it couldn't load
  const [tables, setTables] = useState<TableInfo[] | string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let gone = false
    listTables().then(
      (list) => !gone && setTables(list),
      (e) => !gone && setTables(downText(e)),
    )
    return () => {
      gone = true
    }
  }, [attempt])

  const join = (e: FormEvent) => {
    e.preventDefault()
    const path = roomIn(link)
    if (path) location.hash = `#${path}`
  }
  return (
    <Screen title="Rooms" intro="" filler={false}>
      {() => (
        <>
          <section>
            <div className="preview-heading">
              <h2>Public tables</h2>
              <button className="poker-toggle" disabled={tables === null} onClick={() => (setTables(null), setAttempt((n) => n + 1))}>
                Refresh
              </button>
            </div>
            <p className="preview-sub">5/10, 1,000 to sit, free top-ups. Bots give up their seat when someone joins.</p>
            {typeof tables === 'string' ? (
              <p role="status">{tables}</p>
            ) : (
              <ul className="preview-list" aria-busy={tables === null}>
                {(tables ?? []).map((table) => (
                  <li key={table.id}>
                    <b>{tableName(table.id)}</b>
                    <span>{seatedText(table)}</span>
                    <a className="poker-toggle" href={`#table/${table.id}`}>
                      {table.humans >= 6 ? 'Watch' : 'Join'}
                    </a>
                  </li>
                ))}
                {tables === null && <li className="preview-loading">Looking…</li>}
              </ul>
            )}
          </section>
          <section className="picker-seats">
            <h2>Private room</h2>
            <p>5/10, 1,000 to sit, free top-ups. Share the link and friends drop straight into a seat.</p>
            <a className="button primary" href={`#room/${newRoomId()}`}>
              Create a room
            </a>
            <form className="preview-join" onSubmit={join}>
              <input aria-label="Invite link" placeholder="Invite link or room code" value={link} onChange={(e) => setLink(e.target.value)} />
              <button className="poker-toggle" disabled={!roomIn(link)}>
                Join
              </button>
            </form>
          </section>
        </>
      )}
    </Screen>
  )
}

const BOARD = [
  { name: 'mako', chips: 18_450 },
  { name: 'jules', chips: 15_200 },
  { name: 'Pip', chips: 12_975 },
  { name: 'ren', chips: 11_040 },
  { name: 'Otto', chips: 10_310 },
]

const TIERS = [
  { name: 'Low', blinds: '5/10', buyIn: '200 to 1,000' },
  { name: 'Mid', blinds: '25/50', buyIn: '1,000 to 5,000' },
  { name: 'High', blinds: '100/200', buyIn: '4,000 to 10,000' },
]

function DailyRace() {
  return (
    <Screen title="Daily Race">
      {(soon) => (
        <>
          <section className="picker-seats">
            <h2>Today</h2>
            <p className="preview-big">10,000</p>
            <p>Everyone starts with this. Biggest balance at midnight New York time wins. Resets in 7h 42m.</p>
          </section>
          <section>
            <h2>Board</h2>
            <ol className="preview-list">
              {BOARD.map((player, i) => (
                <li key={player.name}>
                  <b>
                    {i + 1}. {player.name}
                  </b>
                  <span>{player.chips.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h2>Bankroll tables</h2>
            <ul className="preview-list">
              {TIERS.map((tier) => (
                <li key={tier.name}>
                  <b>{tier.name}</b>
                  <span>
                    {tier.blinds} · buy in {tier.buyIn}
                  </span>
                  <button className="poker-toggle" onClick={soon}>
                    Sit
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </Screen>
  )
}

const BOARDS = {
  Rating: ['mako 2,410', 'Pip 2,180', 'jules 1,960', 'Otto 1,720', 'ren 1,505'],
  'Win rate': ['jules +11.4', 'mako +9.8', 'ren +6.1', 'Pip +4.0', 'Otto +2.7'],
  'Daily race': BOARD.map((player) => `${player.name} ${player.chips.toLocaleString()}`),
}

function Profile() {
  const [board, setBoard] = useState<keyof typeof BOARDS>('Rating')
  return (
    <Screen title="Profile">
      {(soon) => (
        <>
          <section className="picker-seats">
            <div className="bio-head">
              <Avatar id="" />
              <p>
                <b>Guest</b> #4821
              </p>
            </div>
            <div className="picker-actions">
              <button className="button neutral" onClick={soon}>
                Google
              </button>
              <button className="button neutral" onClick={soon}>
                Discord
              </button>
              <button className="button primary" onClick={soon}>
                Avatar
              </button>
            </div>
          </section>
          <section>
            <h2>Stats</h2>
            <ul className="preview-list">
              <li>
                <b>Hands</b>
                <span>1,284</span>
              </li>
              <li>
                <b>Win rate</b>
                <span>+6.2 bb/100</span>
              </li>
              <li>
                <b>Rating</b>
                <span>after 46 more hands</span>
              </li>
            </ul>
          </section>
          <section>
            <h2>Leaderboards</h2>
            <div className="seat-count" role="group" aria-label="Leaderboard">
              {(Object.keys(BOARDS) as (keyof typeof BOARDS)[]).map((name) => (
                <button
                  key={name}
                  className={`poker-toggle ${name === board ? 'on' : ''}`}
                  aria-pressed={name === board}
                  onClick={() => setBoard(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <ol className="preview-list">
              {BOARDS[board].map((row, i) => (
                <li key={row}>
                  <b>{i + 1}.</b>
                  <span>{row}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </Screen>
  )
}

const SCREENS = { quick: QuickPlay, rooms: Rooms, race: DailyRace, profile: Profile }

export default function Previews({ name }: { name: PreviewName }) {
  const Shown = SCREENS[name]
  return <Shown />
}
