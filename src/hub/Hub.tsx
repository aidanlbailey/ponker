import type { ReactNode } from 'react'
import '@fontsource-variable/manrope'
import { Title } from '../components/Title'
import './hub.css'

// ︎ keeps the suits as text, some phones turn them into emoji otherwise
const MODES = [
  { href: '#bots', icon: 'Ξ', name: 'Bots', blurb: 'Pick your bots, play solo' },
  { href: '#rooms', icon: '♠︎', name: 'Rooms', blurb: 'Public tables and private rooms' },
  { href: '#race', icon: '♦︎', name: 'Daily Race', blurb: 'Coming later', later: true },
]

// the deck comes from App, which owns the menu it deals
export function Hub({ deck }: { deck: ReactNode }) {
  return (
    <main className="hub">
      <div className="hub-corner">{deck}</div>
      <Title tag="beta" />
      <nav className="hub-menu" aria-label="Play">
        <a className="button primary hub-quick" href="#quick">
          Quick Play
        </a>
        {MODES.map((mode) => (
          <a key={mode.href} className={`hub-mode ${mode.later ? 'later' : ''}`} href={mode.href}>
            <span className="hub-icon" aria-hidden="true">
              {mode.icon}
            </span>
            <b>{mode.name}</b>
            <small>{mode.blurb}</small>
          </a>
        ))}
        <div className="hub-extras">
          <a className="hub-extra" href="#chips">
            Chip Tracker
          </a>
          <a className="hub-extra" href="#profile">
            Profile
          </a>
        </div>
      </nav>
    </main>
  )
}
