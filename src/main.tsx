import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/atkinson-hyperlegible/latin-700.css'
import '@fontsource/vt323/latin-400.css'
import '@fontsource/silkscreen/latin-400.css'
import '@fontsource-variable/montserrat'
import '@fontsource-variable/rubik'
import '@fontsource/adwaita-mono/latin-400.css'
import '@fontsource/adwaita-mono/latin-700.css'
import { App } from './App'
import { sound, unlock, type SoundName } from './lib/sound'
import { musicVisibility, unlockMusic } from './lib/music'
import './styles.css'
import './looks.css'

// a touch's pointerdown doesn't count as a gesture, so iOS only lets audio start on the finger coming up.
// pointerdown stays for mice, so the files start loading a beat sooner
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(type, unlock)
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(type, unlockMusic)
document.addEventListener('visibilitychange', musicVisibility)

// every button clicks, unless it says otherwise with data-sound. Things that make their own noise
// (chips, the menu's cards, bet actions) set data-sound="none"
addEventListener('click', (e) => {
  const button = (e.target as Element).closest?.('button, [role="button"], a[href]')
  if (!button || button.matches(':disabled')) return
  const named = button.closest('[data-sound]')?.getAttribute('data-sound')
  if (named === 'none') return
  sound((named as SoundName) ?? (button.hasAttribute('aria-pressed') ? 'toggle' : 'click'))
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
