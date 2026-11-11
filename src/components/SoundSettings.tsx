import { useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from './Dialog'
import { setSound, setSoundVolume, soundOn, soundVolume } from '../lib/sound'
import { musicState, setMusic, setMusicVolume, subscribeMusic } from '../lib/music'
import './sound-settings.css'

export function SoundSettings({ home = false }: { home?: boolean }) {
  const [open, setOpen] = useState(false)
  const [sfx, setSfx] = useState(soundOn)
  const [sfxVolume, setSfxVolume] = useState(soundVolume)
  const music = useSyncExternalStore(subscribeMusic, musicState)
  const audible = (sfx && sfxVolume > 0) || (music.enabled && music.volume > 0)

  return <>
    <button
      className={home ? 'sound-home' : `poker-toggle poker-icon${audible ? ' on' : ''}`}
      aria-label="Sound"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" />
        <path d={audible ? 'M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12' : 'M16 9l6 6M22 9l-6 6'} />
      </svg>
    </button>
    {open && createPortal(
      <Dialog title="Sound" className="sound-settings" onClose={() => setOpen(false)}>
        <div className="sound-options">
          <div className="sound-channel">
            <button className="sound-option" aria-pressed={music.enabled} onClick={() => setMusic(!music.enabled)}>
              <span>Music</span><span>{music.enabled ? 'On' : 'Off'}</span>
            </button>
            <label className="sound-volume">
              <span>Music volume</span><output>{Math.round(music.volume * 100)}%</output>
              <input aria-label="Music volume" type="range" min="0" max="100" step="1" value={Math.round(music.volume * 100)} onChange={(event) => setMusicVolume(Number(event.target.value) / 100)} />
            </label>
          </div>
          <div className="sound-channel">
            <button className="sound-option" aria-pressed={sfx} onClick={() => {
              setSound(!sfx)
              setSfx(!sfx)
            }}>
              <span>Sound effects</span><span>{sfx ? 'On' : 'Off'}</span>
            </button>
            <label className="sound-volume">
              <span>Sound effects volume</span><output>{Math.round(sfxVolume * 100)}%</output>
              <input aria-label="Sound effects volume" type="range" min="0" max="100" step="1" value={Math.round(sfxVolume * 100)} onChange={(event) => {
                const volume = Number(event.target.value) / 100
                setSoundVolume(volume)
                setSfxVolume(volume)
              }} />
            </label>
          </div>
        </div>
        <p className="sound-credit">Solace by Scott Joplin<br />
          Piano: <a href="https://commons.wikimedia.org/wiki/File:Joplin-Solace-Stephan.ogg" target="_blank" rel="noreferrer">Constantin Stephan</a>
          {' ('}<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>{')'}
        </p>
        {music.failed && <p role="status">Couldn't play the music. <button className="button" onClick={() => setMusic(true)}>Retry</button></p>}
      </Dialog>, document.body,
    )}
  </>
}
