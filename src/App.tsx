import { lazy, Suspense, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { CardMenu, CLUBS, DIAMONDS, HEARTS, NEXT_THEME, SPADES, type MenuCard, type Theme } from './components/CardMenu'
import { ChipCard } from './components/ChipCard'
import { ChipEditor } from './components/ChipEditor'
import { ChipToss, createToss, type Toss } from './components/ChipToss'
import { NameDialog } from './components/NameDialog'
import { Presets } from './components/Presets'
import { Title } from './components/Title'
import { Toast, type ToastMessage } from './components/Toast'
import { Hub } from './hub/Hub'
import type { PreviewName } from './hub/Previews'
import { useStoredState } from './hooks/useStoredState'
import { cashoutText } from './lib/cashout'
import { DEFAULT_CHIPS, NEW_CHIP, formatMoney, isChips, totalValue, type Chip, type Chips } from './lib/chips'
import { haptic } from './lib/haptics'
import { smoothly } from './lib/smoothly'

// only pulled in when someone sits down, the tracker doesn't pay for the poker game
const Game = lazy(() => import('./game/Game'))
const BotPicker = lazy(() => import('./game/BotPicker'))
const Previews = lazy(() => import('./hub/Previews'))

const PREVIEWS: Record<string, PreviewName> = { '#quick': 'quick', '#rooms': 'rooms', '#race': 'race', '#profile': 'profile' }

const onHashChange = (listener: () => void) => {
  addEventListener('hashchange', listener)
  return () => removeEventListener('hashchange', listener)
}

const isTheme = (data: unknown): data is Theme => data === 'dark' || data === 'light' || data === 'felt'

export function App() {
  const [chips, setChips] = useStoredState<Chips>('ponker-chips', DEFAULT_CHIPS, isChips)
  const [theme, setTheme] = useStoredState<Theme>('ponker-theme', 'felt', isTheme)
  const [userName, setUserName] = useStoredState('ponker-user-name', '')
  const [showValues, setShowValues] = useStoredState('ponker-show-values', true)

  const [panel, setPanel] = useState<'menu' | 'presets' | 'name' | null>(null)
  const [deck, setDeck] = useState<DOMRect | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tosses, setTosses] = useState<Toss[]>([])
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const hash = useSyncExternalStore(onHashChange, () => location.hash)

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

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
  }

  const removeChip = (id: string, chip: Chip, from: DOMRect) => {
    if (!chip.count) return
    updateChip(id, { count: chip.count - 1 })
    setTosses((prev) => [...prev, createToss('rise', chip.color, chip.count, from)])
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

  const deckButton = (
    <button
      className={`deck ${panel === 'menu' ? 'dealt' : ''}`}
      aria-label={home ? 'Settings' : 'Open menu'}
      onClick={(e) => {
        setDeck(e.currentTarget.getBoundingClientRect())
        setPanel('menu')
        haptic('light')
      }}
    >
      <span className="card-back" />
      <span className="card-back" />
      <span className="card-back" />
      {home && <span className="deck-caption">Settings</span>}
    </button>
  )

  // the hub only gets what applies to the whole app, the chip stuff stays with the tracker
  const next = NEXT_THEME[theme]
  const nameCard = { label: userName ? 'Change name' : 'Set your name', run: () => setPanel('name'), opensPanel: true }
  const themeCard = { label: next.label, run: () => smoothly(() => setTheme(next.theme)) }
  const about = { label: 'About Ponker', href: 'https://github.com/aidanlbailey/ponker#readme' }
  const coffee = { label: 'Buy me a coffee', href: 'https://ko-fi.com/aidanlbailey' }
  const cards: MenuCard[] = home
    ? [
        { rank: 'A', suit: SPADES, ...nameCard },
        { rank: 'K', suit: DIAMONDS, ...themeCard },
        { rank: 'Q', suit: CLUBS, ...about },
        { rank: 'J', suit: HEARTS, ...coffee },
      ]
    : [
        { rank: 'A', suit: SPADES, label: 'Add chip type', run: addChipType },
        { rank: 'K', suit: DIAMONDS, label: 'Cash out', run: shareCashout },
        { rank: 'Q', suit: HEARTS, ...nameCard },
        { rank: 'J', suit: CLUBS, label: 'Chip presets', run: () => setPanel('presets'), opensPanel: true },
        {
          rank: '10',
          suit: SPADES,
          label: showValues ? 'Hide values' : 'Show values',
          run: () => smoothly(() => setShowValues(!showValues)),
        },
        { rank: '9', suit: DIAMONDS, ...themeCard },
        { rank: '8', suit: CLUBS, ...about },
        { rank: '7', suit: HEARTS, ...coffee },
      ]

  return (
    <>
      {home ? (
        <Hub deck={deckButton} />
      ) : (
        <main className="app">
          <Title />

          <div className="top-bar">
            {deckButton}
            {showValues && <output className="total">{total}</output>}
            <a className="button primary play-link" href="#">
              Play poker
            </a>
          </div>

          <section className="chip-grid" aria-label="Chips">
            {entries.map(([id, chip]) => (
              <ChipCard
                key={id}
                id={id}
                chip={chip}
                showValue={showValues}
                onAdd={(from) => addChip(id, chip, from)}
                onRemove={(from) => removeChip(id, chip, from)}
                onEdit={() => setEditingId(id)}
                onValueChange={(value) => updateChip(id, { value })}
              />
            ))}
          </section>
        </main>
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

      {panel === 'name' && (
        <NameDialog
          name={userName}
          onChange={setUserName}
          onClose={() => setPanel(null)}
          onRenamed={() => notify('Name changed!')}
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
