import { useState } from 'react'
import { Dialog } from '../components/Dialog'
import { useStoredState } from '../hooks/useStoredState'
import { save } from '../lib/storage'
import { Avatar } from './Pieces'
import { BOTS, botById, randomBots, SKILLS, type Bot } from './roster'
import { newSolo, STORAGE_KEY } from './solo'
import '@fontsource-variable/manrope'
import './game.css'
import './picker.css'

const SEAT_COUNTS = [2, 3, 4, 5, 6]

const isSeatCount = (data: unknown): data is number => SEAT_COUNTS.includes(data as number)

const isIds = (data: unknown): data is string[] =>
  Array.isArray(data) && data.length < 6 && data.every((id) => typeof id === 'string' && botById(id))

function BioCard({ bot, picked, full, onToggle, onClose }: {
  bot: Bot
  picked: boolean
  full: boolean
  onToggle: () => void
  onClose: () => void
}) {
  return (
    <Dialog title={bot.name} className="bio-card" onClose={onClose}>
      {(close) => (
        <>
          <div className="bio-head">
            <Avatar id={bot.id} />
            <p>
              <b>{bot.skill}</b> {bot.style.toLowerCase()}
            </p>
          </div>
          <p className="bio-text">{bot.bio}</p>
          <button
            className={`button ${picked ? 'neutral' : 'primary'}`}
            disabled={!picked && full}
            onClick={() => close(onToggle)}
          >
            {picked ? 'Take off the table' : full ? 'Table is full' : 'Seat at the table'}
          </button>
        </>
      )}
    </Dialog>
  )
}

// always a fresh table, so changing the lineup never drops you back into an old hand
function play(bots: string[]) {
  save(STORAGE_KEY, newSolo(bots))
  location.hash = '#play'
}

export default function BotPicker() {
  const [picked, setPicked] = useStoredState<string[]>('ponker-bots', ['bot:xi'], isIds)
  const [seats, setSeats] = useStoredState('ponker-seats', 2, isSeatCount)
  const [open, setOpen] = useState<Bot | null>(null)

  const room = seats - 1
  const chosen = picked.slice(0, room)
  const full = chosen.length >= room
  const toggle = (id: string) =>
    setPicked(chosen.includes(id) ? chosen.filter((other) => other !== id) : [...chosen, id])
  const fill = () => setPicked([...chosen, ...randomBots(room - chosen.length, chosen).map((bot) => bot.id)])

  return (
    <div className="poker picker">
      <header className="poker-bar">
        <a href="#" className="poker-link">
          <span aria-hidden="true">{'‹'}</span> Home
        </a>
        <span className="poker-spacer" />
        <span className="poker-stakes">Bots</span>
      </header>

      <main className="picker-body">
        <section className="picker-seats" aria-label="Table">
          <div className="seat-count" role="group" aria-label="Players">
            {SEAT_COUNTS.map((count) => (
              <button
                key={count}
                className={`poker-toggle ${count === seats ? 'on' : ''}`}
                aria-pressed={count === seats}
                onClick={() => setSeats(count)}
              >
                {count}
              </button>
            ))}
            <span className="seat-count-label">players</span>
          </div>
          <ol className="picked">
            {Array.from({ length: room }, (_, i) => {
              const bot = botById(chosen[i] ?? '')
              return (
                <li key={i}>
                  {bot ? (
                    <button className="picked-bot" onClick={() => setOpen(bot)}>
                      <Avatar id={bot.id} />
                      <span>{bot.name}</span>
                    </button>
                  ) : (
                    <span className="picked-empty">Empty</span>
                  )}
                </li>
              )
            })}
          </ol>
          <div className="picker-actions">
            <button className="button neutral" disabled={full} onClick={fill}>
              Fill with random bots
            </button>
            <button className="button primary" disabled={!full} onClick={() => play(chosen)}>
              Play
            </button>
          </div>
        </section>

        {SKILLS.map((skill) => (
          <section key={skill} className="skill-group" aria-label={skill}>
            <h2>{skill}</h2>
            <div className="bot-grid">
              {BOTS.filter((bot) => bot.skill === skill).map((bot) => (
                <button
                  key={bot.id}
                  className={`bot-tile ${chosen.includes(bot.id) ? 'on' : ''}`}
                  aria-pressed={chosen.includes(bot.id)}
                  onClick={() => setOpen(bot)}
                >
                  <Avatar id={bot.id} />
                  <span>{bot.name}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>

      {open && (
        <BioCard
          bot={open}
          picked={chosen.includes(open.id)}
          full={full}
          onToggle={() => toggle(open.id)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
