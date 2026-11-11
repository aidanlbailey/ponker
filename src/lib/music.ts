import { load, save } from './storage'

const KEY = 'ponker-music'
const SOURCE = 'https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b5/Joplin-Solace-Stephan.ogg/Joplin-Solace-Stephan.ogg.mp3'
const VOLUME_KEY = 'ponker-music-volume'
let state = {
  enabled: load(KEY, false),
  volume: load(VOLUME_KEY, 0.3, (value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1),
  failed: false,
}
let player: HTMLAudioElement | undefined
let pending = false
const listeners = new Set<() => void>()

export const musicState = () => state
export const subscribeMusic = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function update(next: typeof state) {
  state = next
  listeners.forEach((listener) => listener())
}

// Keep one streaming player across routes, without decoding the whole track into Web Audio.
export function unlockMusic() {
  if (!state.enabled || document.hidden || pending || (player && !player.paused)) return
  if (!player) {
    player = new Audio(SOURCE)
    player.loop = true
    player.preload = 'none'
    player.volume = state.volume
    player.addEventListener('error', () => update({ ...state, failed: true }))
  }
  if (player.error) player.load()
  pending = true
  let succeeded = false
  void player.play().then(() => {
    succeeded = true
    if (!state.enabled || document.hidden) player?.pause()
    if (state.failed) update({ ...state, failed: false })
  }).catch((error: unknown) => {
    // Autoplay blocks and pauses during a pending play can be retried on the next gesture.
    if (error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name)) return
    update({ ...state, failed: true })
  }).finally(() => {
    pending = false
    // A quick off/on or tab switch can pause the player before play() settles.
    if (succeeded) unlockMusic()
  })
}

export function setMusic(enabled: boolean) {
  save(KEY, enabled)
  update({ ...state, enabled, failed: false })
  if (enabled) unlockMusic()
  else player?.pause()
}

export function setMusicVolume(volume: number) {
  if (!Number.isFinite(volume)) return
  volume = Math.max(0, Math.min(1, volume))
  save(VOLUME_KEY, volume)
  if (player) player.volume = volume
  update({ ...state, volume })
}

export function musicVisibility() {
  if (document.hidden) player?.pause()
  else unlockMusic()
}
