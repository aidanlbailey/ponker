import { formatMoney, nearestColor, totalValue, type Chip, type Chips } from './chips'

const BILLS = [10000, 5000, 2000, 1000, 500, 100]
const COINS: [cents: number, one: string, many: string][] = [
  [25, 'quarter', 'quarters'],
  [10, 'dime', 'dimes'],
  [5, 'nickel', 'nickels'],
  [1, 'penny', 'pennies'],
]

// penny-stakes tables settle in coins, so bills only show up once a chip is worth $1 or more
export function cashoutBreakdown(total: number, chips: Chip[]) {
  const parts: string[] = []
  let cents = Math.round(total * 100)

  if (chips.some((chip) => chip.value >= 1)) {
    for (const bill of BILLS) {
      const count = Math.floor(cents / bill)
      if (count) parts.push(`${count} $${bill / 100} bill${count > 1 ? 's' : ''}`)
      cents %= bill
    }
  }

  for (const [coin, one, many] of COINS) {
    const count = Math.floor(cents / coin)
    if (count) parts.push(`${count} ${count > 1 ? many : one}`)
    cents %= coin
  }

  return parts
}

const chipValue = (value: number) => (value >= 1 ? formatMoney(value) : `${Math.round(value * 100)}¢`)

export function cashoutText(chips: Chips, userName: string) {
  const active = Object.values(chips).filter((chip) => chip.count > 0)
  if (!active.length) return null

  const lines = active.map(({ count, value, color }) => {
    const { emoji, name } = nearestColor(color)
    return `${emoji} ${count.toLocaleString('en-US')} ${name} chips (${chipValue(value)} each)`
  })
  const total = totalValue(chips)
  const breakdown = cashoutBreakdown(total, active)

  return [
    userName ? `${userName}'s chips:` : 'My chips:',
    ...lines,
    '',
    `Total: ${formatMoney(total)}`,
    ...(breakdown.length ? [`Cashout: ${breakdown.join(', ')}`] : []),
  ].join('\n')
}
