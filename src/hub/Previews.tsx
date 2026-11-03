import { useState, type ReactNode } from 'react'
import { Avatar } from '../game/Pieces'
import '@fontsource-variable/manrope'
import '../game/game.css'
import '../game/picker.css'
import './previews.css'

// Filler screens so the whole hub can be clicked through before the real ones exist. All the data
// is made up. Each screen goes when its milestone lands: Rooms 5, Quick Play 6, Profile 7, Daily Race 8

export type PreviewName = 'quick' | 'rooms' | 'race' | 'profile'

const SOON = "Coming soon, this part isn't built yet"

function Screen({ title, children }: { title: string; children: (soon: () => void) => ReactNode }) {
  const [note, setNote] = useState('Preview, everything here is made up')
  return (
    <div className="poker picker preview">
      <header className="poker-bar">
        <a href="#" className="poker-link">
          <span aria-hidden="true">{'‹'}</span> Home
        </a>
        <span className="poker-spacer" />
        <span className="poker-stakes">{title}</span>
        <span className="preview-tag">Preview</span>
      </header>
      <main className="picker-body">
        <p className="preview-note" role="status">
          {note}
        </p>
        {children(() => setNote(SOON))}
      </main>
    </div>
  )
}

function QuickPlay() {
  return (
    <Screen title="Quick Play">
      {(soon) => (
        <section className="picker-seats">
          <h2>Public table 1/2</h2>
          <p>No open tables right now, so this one is yours until someone joins.</p>
          <ol className="picked">
            <li>
              <span className="picked-bot">
                <Avatar id="" />
                <span>You</span>
              </span>
            </li>
            {[1, 2, 3, 4, 5].map((seat) => (
              <li key={seat}>
                <span className="picked-empty">Empty</span>
              </li>
            ))}
          </ol>
          <div className="picker-actions">
            <button className="button neutral" onClick={soon}>
              Wait
            </button>
            <button className="button neutral" onClick={soon}>
              Invite
            </button>
            <a className="button primary" href="#bots">
              Play bots
            </a>
          </div>
        </section>
      )}
    </Screen>
  )
}

const TABLES = [
  { name: 'Night Owls', stakes: '1/2', seated: 5 },
  { name: 'Low Road', stakes: '1/2', seated: 3 },
  { name: 'Felt Club', stakes: '1/2', seated: 2 },
  { name: 'Riverboat', stakes: '1/2', seated: 1 },
]

function Rooms() {
  return (
    <Screen title="Rooms">
      {(soon) => (
        <>
          <section>
            <h2>Public tables</h2>
            <ul className="preview-list">
              {TABLES.map((table) => (
                <li key={table.name}>
                  <b>{table.name}</b>
                  <span>
                    {table.stakes} · {table.seated}/6
                  </span>
                  <button className="poker-toggle" onClick={soon}>
                    Join
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="picker-seats">
            <h2>Private room</h2>
            <button className="button primary" onClick={soon}>
              Create a room
            </button>
            <div className="preview-join">
              <input aria-label="Invite link" placeholder="Paste an invite link" />
              <button className="poker-toggle" onClick={soon}>
                Join
              </button>
            </div>
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
