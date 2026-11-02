import { useLayoutEffect, useState } from 'react'
import { CardMenu, type Theme } from './components/CardMenu'
import { ChipCard } from './components/ChipCard'
import { ChipEditor } from './components/ChipEditor'
import { ChipToss, createToss, type Toss } from './components/ChipToss'
import { NameDialog } from './components/NameDialog'
import { Presets } from './components/Presets'
import { Title } from './components/Title'
import { Toast, type ToastMessage } from './components/Toast'
import { useStoredState } from './hooks/useStoredState'
import { cashoutText } from './lib/cashout'
import { DEFAULT_CHIPS, NEW_CHIP, formatMoney, isChips, totalValue, type Chip, type Chips } from './lib/chips'
import { haptic } from './lib/haptics'
import { smoothly } from './lib/smoothly'

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

  return (
    <>
      <main className="app">
        <Title />

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
          {showValues && <output className="total">{total}</output>}
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

      <ChipToss tosses={tosses} onDone={(id) => setTosses((prev) => prev.filter((toss) => toss.id !== id))} />

      {panel === 'menu' && deck && (
        <CardMenu
          deck={deck}
          theme={theme}
          userName={userName}
          showValues={showValues}
          onClose={() => setPanel(null)}
          onAddChipType={addChipType}
          onOpenPresets={() => setPanel('presets')}
          onOpenName={() => setPanel('name')}
          onCashout={shareCashout}
          onToggleValues={() => smoothly(() => setShowValues(!showValues))}
          onThemeChange={(next) => smoothly(() => setTheme(next))}
        />
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
