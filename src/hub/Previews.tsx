import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { pickTable, PUBLIC_TABLES, tableName, type TableInfo } from '../room/public'
import { listTables, newRoomId } from '../room/useRoom'
import '@fontsource-variable/manrope'
import '@fontsource/roboto/latin-400.css'
import '../game/game.css'
import '../game/menus.css'
import '../game/picker.css'
import './previews.css'

// The hub's other screens. Daily Race isn't open yet

export type PreviewName = 'quick' | 'rooms' | 'race'

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="poker picker preview">
      <header className="poker-bar">
        <a href="#" className="poker-link">
          <span aria-hidden="true">{'‹'}</span> Home
        </a>
        <span className="poker-spacer" />
        <span className="poker-stakes">{title}</span>
      </header>
      <main className="picker-body">{children}</main>
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
    <Screen title="Quick Play">
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
    <Screen title="Rooms">
      <>
        <section>
          <div className="preview-heading">
            <h2>Public tables</h2>
            <button className="poker-toggle" aria-label="Refresh" title="Refresh" disabled={tables === null} onClick={() => (setTables(null), setAttempt((n) => n + 1))}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
                <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                <path d="M20 4v5h-5" />
              </svg>
            </button>
          </div>
          {typeof tables === 'string' ? (
            <p role="status">{tables}</p>
          ) : (
            <ul className="preview-list" aria-busy={tables === null}>
              {(tables ?? []).map((table) => (
                <li key={table.id}>
                  <b>{tableName(table.id)}</b>
                  <span>{seatedText(table)}</span>
                  <a className="poker-toggle poker-link" href={`#table/${table.id}`}>
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
    </Screen>
  )
}

// not open yet. Says so and nothing more, what's planned stays off the page
function Later({ title }: { title: string }) {
  return (
    <Screen title={title}>
      <section className="picker-seats">
        <h2>Not open yet</h2>
        <p>{title} is coming later. Quick Play, Bots and Rooms are all open.</p>
        <a className="button primary" href="#">
          Back home
        </a>
      </section>
    </Screen>
  )
}

const DailyRace = () => <Later title="Daily Race" />

const SCREENS = { quick: QuickPlay, rooms: Rooms, race: DailyRace }

export default function Previews({ name }: { name: PreviewName }) {
  const Shown = SCREENS[name]
  return <Shown />
}
