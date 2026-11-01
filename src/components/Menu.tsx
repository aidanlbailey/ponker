import { haptic } from '../lib/haptics'
import { Dialog } from './Dialog'

export type Theme = 'dark' | 'light' | 'felt'

const NEXT_THEME = {
  dark: { theme: 'light', icon: '☀️', label: 'Light Mode' },
  light: { theme: 'felt', icon: '🃏', label: 'Felt Mode' },
  felt: { theme: 'dark', icon: '🌙', label: 'Dark Mode' },
} as const

const LINKS = [
  { icon: 'ℹ️', label: 'About PONKER', href: 'https://github.com/aidanlbailey/ponker#readme', className: '' },
  { icon: '☕', label: 'Buy me a Coffee', href: 'https://ko-fi.com/aidanlbailey', className: 'kofi' },
]

type MenuProps = {
  theme: Theme
  userName: string
  showValues: boolean
  onClose: () => void
  onAddChipType: () => void
  onOpenPresets: () => void
  onOpenName: () => void
  onCashout: () => void
  onToggleValues: () => void
  onThemeChange: (theme: Theme) => void
}

export function Menu(props: MenuProps) {
  const { theme, userName, showValues, onClose, onThemeChange } = props
  const next = NEXT_THEME[theme]
  const suffix = userName ? ` (${userName})` : ''

  const actions = [
    { icon: '+', label: 'Add Chip Type', run: props.onAddChipType },
    { icon: '🎲', label: 'Chip Presets', run: props.onOpenPresets, keepsPanel: true },
    { icon: '💵', label: `Cashout${suffix}`, run: props.onCashout },
    { icon: '👁️', label: showValues ? 'Hide Values' : 'Show Values', run: props.onToggleValues },
    {
      icon: '👤',
      label: userName ? `Change Name${suffix}` : 'Set Your Name',
      run: props.onOpenName,
      keepsPanel: true,
    },
    { icon: next.icon, label: next.label, run: () => onThemeChange(next.theme) },
  ]

  return (
    <Dialog title="Menu" className="menu" onClose={onClose}>
      <nav className="menu-items">
        {actions.map(({ icon, label, run, keepsPanel }) => (
          <button
            key={icon}
            className="menu-item"
            onClick={() => {
              haptic('light')
              if (!keepsPanel) onClose()
              run()
            }}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
        {LINKS.map(({ icon, label, href, className }) => (
          <a key={href} className={`menu-item ${className}`} href={href} target="_blank" rel="noreferrer">
            <span aria-hidden="true">{icon}</span>
            {label}
          </a>
        ))}
      </nav>
    </Dialog>
  )
}
