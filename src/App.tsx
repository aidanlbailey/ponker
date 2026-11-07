import { lazy, Suspense, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { CardMenu, CLUBS, DIAMONDS, HEARTS, SPADES, type MenuCard } from './components/CardMenu'
import { ChipCard } from './components/ChipCard'
import { ChipEditor } from './components/ChipEditor'
import { ChipToss, LAND_MS, createToss, type Toss } from './components/ChipToss'
import { Presets } from './components/Presets'
import '@fontsource/rubik-mono-one/latin-400.css'
import { Title } from './components/Title'
import { Toast, type ToastMessage } from './components/Toast'
import { Hub } from './hub/Hub'
import type { PreviewName } from './hub/Previews'
import { PUBLIC_TABLES } from './room/public'
import { useStoredState } from './hooks/useStoredState'
import { cashoutText } from './lib/cashout'
import { DEFAULT_CHIPS, NEW_CHIP, formatMoney, isChips, totalValue, type Chip, type Chips } from './lib/chips'
import { takeSignIn } from './lib/account'
import { haptic } from './lib/haptics'
import { sound } from './lib/sound'
import { smoothly } from './lib/smoothly'

// only pulled in when someone sits down, the tracker doesn't pay for the poker game
const Game = lazy(() => import('./game/Game'))
const BotPicker = lazy(() => import('./game/BotPicker'))
const Previews = lazy(() => import('./hub/Previews'))
const Room = lazy(() => import('./room/Room'))
const Profile = lazy(() => import('./profile/Profile'))
const History = lazy(() => import('./game/History'))

// before anything reads the hash, or #signin/<token> reads as a broken link
takeSignIn()

const ROOM_HASH = new RegExp(`^#(room/[a-z0-9]{4,16}|table/(${PUBLIC_TABLES.join('|')}))$`)
const PREVIEWS: Record<string, PreviewName> = { '#quick': 'quick', '#rooms': 'rooms', '#race': 'race' }
// lowercased, so a code someone typed or read out in capitals still lands
const known = (raw: string) => {
  const hash = raw.toLowerCase()
  return ['', '#', '#chips', '#bots', '#play', '#profile', '#admin', '#history'].includes(hash) || /^#history\/\d+$/.test(hash) || hash in PREVIEWS || ROOM_HASH.test(hash)
}
const badLink = (): ToastMessage => ({ text: "That link doesn't go anywhere", type: 'error', id: Date.now() })
// a mistyped or broken link goes home, but says so rather than just looking like the wrong page
function landOn(raw: string) {
  const hash = known(raw) ? raw.toLowerCase() : ''
  if (hash !== raw) history.replaceState(null, '', location.pathname + location.search + hash)
  return hash
}

export function App() {
  const [chips, setChips] = useStoredState<Chips>('ponker-chips', DEFAULT_CHIPS, isChips)
  const [userName, setUserName] = useStoredState('ponker-user-name', '')

  const [panel, setPanel] = useState<'menu' | 'presets' | null>(null)
  const [deck, setDeck] = useState<DOMRect | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tosses, setTosses] = useState<Toss[]>([])
  const [toast, setToast] = useState<ToastMessage | null>(() => (known(location.hash) ? null : badLink()))
  const [hash, setHash] = useState(() => landOn(location.hash))

  // every page change crossfades. The lazy pages render nothing until their code is in, so the new
  // snapshot waits for something to be on screen, or it would fade to blank and then pop in.
  // setTimeout and not requestAnimationFrame, frames are held back until this resolves
  useEffect(() => {
    const root = document.getElementById('root')!
    const follow = () => {
      if (!known(location.hash)) setToast(badLink())
      const next = landOn(location.hash)
      if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return setHash(next)
      const transition = document.startViewTransition(async () => {
        flushSync(() => setHash(next))
        for (let waited = 0; !root.childElementCount && waited < 2000; waited += 16) {
          await new Promise((done) => setTimeout(done, 16))
        }
      })
      transition.ready.catch(() => {})
    }
    addEventListener('hashchange', follow)
    return () => removeEventListener('hashchange', follow)
  }, [])

  const notify = (text: string, type: ToastMessage['type'] = 'success') => {
    setToast({ text, type, id: Date.now() })
    haptic(type)
  }

  const updateChip = (id: string, changes: Partial<Chip>) =>
    setChips((prev) => {
      const chip = prev[id]
      return chip ? { ...prev, [id]: { ...chip, ...changes } } : prev
    })

  const addChip = (id: string, chip: Chip, from: DOMRect) => {
    updateChip(id, { count: chip.count + 1 })
    setTosses((prev) => [...prev, createToss('fall', chip.color, chip.count + 1, from)])
    sound('stack', { delay: LAND_MS })
  }

  const removeChip = (id: string, chip: Chip, from: DOMRect) => {
    if (!chip.count) return
    updateChip(id, { count: chip.count - 1 })
    setTosses((prev) => [...prev, createToss('rise', chip.color, chip.count, from)])
    sound('handle')
  }

  const deleteChip = (id: string) => {
    smoothly(() => setChips((prev) => Object.fromEntries(Object.entries(prev).filter(([chipId]) => chipId !== id))))
    setEditingId(null)
    haptic('success')
  }

  const addChipType = () => {
    smoothly(() => setChips((prev) => ({ ...prev, [`chip_${Date.now()}`]: NEW_CHIP })))
  }

  const shareCashout = async () => {
    const text = cashoutText(chips, userName)
    if (!text) return notify('No chips to cash out! Add some chips first.', 'error')

    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: 'PONKER Cashout', text })
        return notify('Cashout shared!')
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }

    try {
      await navigator.clipboard.writeText(text)
      notify(userName ? `${userName}'s cashout copied!` : 'Cashout copied!')
    } catch {
      notify("Couldn't copy your cashout", 'error')
    }
  }

  const total = formatMoney(totalValue(chips))
  const entries = Object.entries(chips)
  const editing = editingId ? chips[editingId] : undefined

  if (hash === '#bots') {
    return (
      <Suspense>
        <BotPicker />
      </Suspense>
    )
  }

  if (hash === '#play') {
    return (
      <Suspense>
        <Game name={userName} />
      </Suspense>
    )
  }

  const roomPath = hash.match(ROOM_HASH)?.[1]
  if (roomPath) {
    return (
      <Suspense>
        <Room key={roomPath} path={roomPath} name={userName} onName={setUserName} />
      </Suspense>
    )
  }

  if (hash.startsWith('#history')) {
    const id = hash.split('/')[1]
    return (
      <Suspense>
        <History key={hash} id={id ? Number(id) : undefined} />
      </Suspense>
    )
  }

  if (hash === '#profile' || hash === '#admin') {
    return (
      <Suspense>
        <Profile key={hash} name={userName} admin={hash === '#admin'} />
      </Suspense>
    )
  }

  const preview = PREVIEWS[hash]
  if (preview) {
    return (
      <Suspense>
        <Previews name={preview} />
      </Suspense>
    )
  }

  // the hub is home, the tracker lives behind it on #chips
  const home = hash !== '#chips'

  const cards: MenuCard[] = [
    { rank: 'A', suit: SPADES, label: 'Add chip type', run: addChipType },
    { rank: 'K', suit: DIAMONDS, label: 'Cash out', run: shareCashout },
    { rank: 'Q', suit: HEARTS, label: 'Chip presets', run: () => setPanel('presets'), opensPanel: true },
    { rank: 'J', suit: CLUBS, label: 'About Ponker', href: 'https://github.com/aidanlbailey/ponker#readme' },
    { rank: '10', suit: SPADES, label: 'Buy me a coffee', href: 'https://ko-fi.com/aidanlbailey' },
  ]

  return (
    <>
      {home ? (
        <Hub />
      ) : (
        <>
          <a className="home-link" href="#">
            <span aria-hidden="true">{'‹'}</span> Home
          </a>
          <main className="app">
            <Title sub="CHIP TRACKER" />

            <div className="top-bar">
              <button
                className={`deck ${panel === 'menu' ? 'dealt' : ''}`}
                aria-label="Open menu"
                onClick={(e) => {
                  setDeck(e.currentTarget.getBoundingClientRect())
                  setPanel('menu')
                  haptic('light')
                }}
              >
                <span className="card-back" />
                <span className="card-back" />
                <span className="card-back" />
              </button>
              <output className="total">{total}</output>
            </div>

            <section className="chip-grid" aria-label="Chips">
              {entries.map(([id, chip]) => (
                <ChipCard
                  key={id}
                  id={id}
                  chip={chip}
                  onAdd={(from) => addChip(id, chip, from)}
                  onRemove={(from) => removeChip(id, chip, from)}
                  onEdit={() => setEditingId(id)}
                  onValueChange={(value) => updateChip(id, { value })}
                />
              ))}
            </section>
          </main>
        </>
      )}

      <ChipToss tosses={tosses} onDone={(id) => setTosses((prev) => prev.filter((toss) => toss.id !== id))} />

      {panel === 'menu' && deck && (
        <CardMenu deck={deck} cards={cards} onClose={() => setPanel(null)} />
      )}

      {panel === 'presets' && (
        <Presets
          onClose={() => setPanel(null)}
          onLoad={(preset) => {
            smoothly(() => setChips(preset))
            haptic('success')
          }}
        />
      )}

      {editingId && editing && (
        <ChipEditor
          chip={editing}
          canDelete={entries.length > 1}
          onColorChange={(color) => updateChip(editingId, { color })}
          onDelete={() => deleteChip(editingId)}
          onClose={() => setEditingId(null)}
        />
      )}

      {toast && <Toast key={toast.id} toast={toast} onDone={() => setToast(null)} />}
    </>
  )
}
