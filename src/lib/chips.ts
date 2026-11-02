export type Chip = { count: number; value: number; color: string }
export type Chips = Record<string, Chip>

const PALETTE = {
  white: { name: 'White', emoji: '⚪', hex: '#ffffff' },
  red: { name: 'Red', emoji: '🔴', hex: '#dc3545' },
  blue: { name: 'Blue', emoji: '🔵', hex: '#007bff' },
  green: { name: 'Green', emoji: '🟢', hex: '#28a745' },
  black: { name: 'Black', emoji: '⚫', hex: '#343a40' },
  purple: { name: 'Purple', emoji: '🟣', hex: '#6f42c1' },
  yellow: { name: 'Yellow', emoji: '🟡', hex: '#ffc107' },
  orange: { name: 'Orange', emoji: '🟠', hex: '#fd7e14' },
  darkgreen: { name: 'Dark Green', emoji: '🟢', hex: '#155724' },
  lightblue: { name: 'Light Blue', emoji: '🔵', hex: '#17a2b8' },
  pink: { name: 'Pink', emoji: '🩷', hex: '#e83e8c' },
}

export const CHIP_COLORS = Object.values(PALETTE)
export const NEW_CHIP: Chip = { count: 0, value: 1, color: '#ff6b6b' }

const stack = (values: Partial<Record<keyof typeof PALETTE, number>>): Chips =>
  Object.fromEntries(
    Object.entries(values).map(([id, value]) => [
      id,
      { count: 0, value, color: PALETTE[id as keyof typeof PALETTE].hex },
    ]),
  )

export const DEFAULT_CHIPS = stack({ white: 1, red: 5, blue: 10, green: 25, black: 100 })

export const PRESETS = [
  {
    id: 'holidaze25-gmoney-pennypoker',
    name: 'HoliDaze25 GMoney NickelPoker',
    author: 'Aidan',
    description: 'Low stakes 2025 holiday "nickel poker" setup',
    chips: stack({ blue: 0.05, green: 0.1, red: 0.25, black: 0.5 }),
  },
  {
    id: 'gmoney-pennypoker',
    name: 'GMoney PennyPoker',
    author: 'Aidan',
    description: 'Low stakes penny poker setup',
    chips: stack({ blue: 0.05, green: 0.1, black: 0.25 }),
  },
  {
    id: 'bmh-pettypoker',
    name: 'BMH "PettyPoker"',
    author: 'BMH',
    description: 'Literally PENNY Poker',
    chips: stack({ blue: 0.01, red: 0.05, green: 0.1, black: 0.25 }),
  },
  {
    id: 'standard-casino',
    name: 'Standard poker chip values and colors',
    author: 'poker.org',
    description: 'Standard casino chip denominations with traditional colors',
    chips: stack({
      white: 1,
      red: 5,
      blue: 10,
      green: 25,
      black: 100,
      purple: 500,
      yellow: 1000,
      orange: 5000,
      darkgreen: 25000,
      lightblue: 100000,
    }),
  },
]

export const totalValue = (chips: Chips) =>
  Object.values(chips).reduce((sum, { count, value }) => sum + count * value, 0)

export const formatMoney = (amount: number) =>
  amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]

export function contrastColor(hex: string) {
  const [r, g, b] = rgb(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#000000' : '#ffffff'
}

// the drop shadow only helps white numbers, on black ones it's just smudge
export function countStyle(hex: string) {
  const color = contrastColor(hex)
  return color === '#000000' ? { color, textShadow: 'none' } : { color }
}

// white chips get navy markings, everything else gets white
export const accentColor = (hex: string) => (hex.toLowerCase() === '#ffffff' ? '#0b289d' : '#ffffff')

// custom colors won't match the palette exactly, so names and emoji come from the closest swatch
export function nearestColor(hex: string) {
  const [r, g, b] = rgb(hex)
  const distance = (swatch: string) => {
    const [sr, sg, sb] = rgb(swatch)
    return (r - sr) ** 2 + (g - sg) ** 2 + (b - sb) ** 2
  }
  return CHIP_COLORS.reduce((best, color) => (distance(color.hex) < distance(best.hex) ? color : best))
}

export const isChips = (data: unknown): data is Chips =>
  typeof data === 'object' &&
  data !== null &&
  !Array.isArray(data) &&
  Object.keys(data).length > 0 &&
  Object.values(data).every(
    (chip: Partial<Chip>) =>
      Number.isFinite(chip?.count) && Number.isFinite(chip?.value) && /^#[0-9a-f]{6}$/i.test(chip?.color ?? ''),
  )
