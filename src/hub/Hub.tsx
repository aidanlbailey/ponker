import { useEffect, useState } from 'react'
import '@fontsource-variable/manrope'
import { ChipMarks } from '../components/Chip'
import { PixelArt } from '../components/PixelArt'
import { cachedMe, call, session, type Me } from '../lib/account'
import { Title } from '../components/Title'
import './hub.css'

const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

const ICONS = {
  rooms: (
    <svg {...svg}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c.8-3.2 3.1-5 6-5s5.2 1.8 6 5" />
      <circle cx="16.5" cy="9" r="2.6" />
      <path d="M16 14c2.4 0 4.2 1.5 5 4.5" />
    </svg>
  ),
  bots: (
    <svg {...svg}>
      <rect x="5" y="8" width="14" height="11" rx="3" />
      <path d="M12 4v4M9.5 13h0M14.5 13h0" />
    </svg>
  ),
  tracker: (
    <svg {...svg}>
      <path d="M10 4L8 20M16 4l-2 16M4.5 9h15M4 15h15" />
    </svg>
  ),
  lock: (
    <svg {...svg}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
}

// the same marks as every other chip, with the mode's icon in the middle
function ModeChip({ icon }: { icon: keyof typeof ICONS }) {
  return (
    <span className={`hub-chip hub-chip-${icon}`}>
      <ChipMarks accent="#fff" className="hub-chip-edge" />
      {ICONS[icon]}
    </span>
  )
}

const Chevron = () => (
  <svg className="hub-chevron" {...svg}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)

// you and your picture once signed in. Shows what was saved last time straight away, then checks with the worker
// in case the name or picture changed on another device
function ProfileLink() {
  const [me, setMe] = useState(cachedMe)
  useEffect(() => {
    if (session()) call<Me>('/me').then(setMe, () => setMe(cachedMe()))
  }, [])
  return (
    <a className="hub-profile" href="#profile" aria-label="Profile">
      {me && <span className="hub-profile-name">{me.name}</span>}
      {me?.avatar ? (
        <PixelArt art={me.avatar} className="hub-profile-icon hub-profile-art" />
      ) : (
        <span className="hub-profile-icon">
          <svg {...svg}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
          </svg>
        </span>
      )}
    </a>
  )
}

// the deck comes from App, which owns the menu it deals
export function Hub() {
  return (
    <main className="hub">
      <ProfileLink />
      <Title tag="beta" />
      <nav className="hub-menu" aria-label="Play">
        <a className="hub-slab hub-quick" href="#quick">
          <svg className="hub-play" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4.5l13 7.5-13 7.5z" />
          </svg>
          <span className="hub-text">
            <b>Quick Play</b>
            <small>Take the next open seat</small>
          </span>
        </a>
        <div className="hub-modes">
          <a className="hub-slab hub-mode" href="#rooms">
            <ModeChip icon="rooms" />
            <span className="hub-text">
              <b>Rooms</b>
              <small>Public tables and private rooms</small>
            </span>
            <Chevron />
          </a>
          <a className="hub-slab hub-mode" href="#bots">
            <ModeChip icon="bots" />
            <span className="hub-text">
              <b>Bots</b>
              <small>Pick your bots, play solo</small>
            </span>
            <Chevron />
          </a>
        </div>
        <div className="hub-extras">
          {/* still opens, to say it isn't ready, so it's dimmed rather than disabled */}
          <a className="hub-slab hub-mode later" href="#race">
            <ModeChip icon="lock" />
            <span className="hub-text">
              <b>Daily Race</b>
              <small>A new leaderboard every day</small>
            </span>
            <span className="hub-soon">Soon!</span>
          </a>
          <a className="hub-slab hub-mode" href="#chips">
            <ModeChip icon="tracker" />
            <span className="hub-text">
              <b>Chip Tracker</b>
              <small>Count up real chips at a home game</small>
            </span>
            <Chevron />
          </a>
        </div>
      </nav>
    </main>
  )
}
