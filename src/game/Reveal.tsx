import { useLayoutEffect, type CSSProperties, type RefObject } from 'react'
import { Avatar, PlayingCard } from './Pieces'
import { potSize } from './betting'
import { MAX_STACK } from './piles'
import { REVEAL_FLIP_MS, REVEAL_MS } from './runout'
import type { TableGame } from './useStage'

export function useBoardCamera(ref: RefObject<HTMLDivElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const felt = ref.current!
    const wrap = felt.parentElement!
    const board = felt.querySelector<HTMLElement>('.board')!
    const pot = felt.querySelector<HTMLElement>('.pot')!
    let close: ReturnType<typeof setTimeout> | undefined
    const frame = () => {
      if (!active) {
        felt.style.setProperty('--camera-x', '0px')
        felt.style.setProperty('--camera-y', '0px')
        felt.style.setProperty('--camera-zoom', '1')
        close = setTimeout(() => wrap.classList.remove('focusing'), 650)
        return
      }
      const camera = new DOMMatrix(getComputedStyle(felt).transform)
      const base = parseFloat(getComputedStyle(felt).scale) || 1
      const f = felt.getBoundingClientRect()
      const bounds = [board, ...pot.querySelectorAll<HTMLElement>('.pot-stack, .pile-label:not(.gone)')].map((el) => el.getBoundingClientRect())
      const slot = pot.querySelector<HTMLElement>('.pot-slot')!.getBoundingClientRect()
      const rise = parseFloat(getComputedStyle(felt).getPropertyValue('--rise'))
      const stacks = Number(pot.style.getPropertyValue('--of'))
      const spread = Math.max(0, stacks - 1) * (slot.width + 4 * base * camera.a) / 2
      // Reserve a full pile before its chips land, so the camera does not chase a growing pot.
      const left = Math.min(...bounds.map((box) => box.left), slot.left - spread)
      const right = Math.max(...bounds.map((box) => box.right), slot.right + spread)
      const top = Math.min(...bounds.map((box) => box.top), slot.top - (MAX_STACK - 1) * rise * base * camera.a)
      const bottom = Math.max(...bounds.map((box) => box.bottom))
      const b = { left, top, width: right - left, height: bottom - top }
      const w = wrap.getBoundingClientRect()
      const toolbar = wrap.closest('.poker')!.querySelector('.poker-bar')!.getBoundingClientRect()
      const visibleTop = Math.max(w.top, toolbar.bottom + 8)
      const height = w.bottom - visibleTop
      // Undo the current camera before measuring its destination, including a resize halfway through an ease.
      const zoom = Math.min(1.65, (w.width - 48) / (b.width / camera.a), (height - 48) / (b.height / camera.a))
      const x = (w.left + w.width / 2 - (f.left + f.width / 2 - base * camera.e)) / base - (b.left + b.width / 2 - f.left - f.width / 2) / (base * camera.a) * zoom
      const y = (visibleTop + height / 2 - (f.top + f.height / 2 - base * camera.f)) / base - (b.top + b.height / 2 - f.top - f.height / 2) / (base * camera.a) * zoom
      wrap.classList.add('focusing')
      felt.style.setProperty('--camera-x', `${x}px`)
      felt.style.setProperty('--camera-y', `${y}px`)
      felt.style.setProperty('--camera-zoom', String(zoom))
    }
    frame()
    const watch = new ResizeObserver(frame)
    const changed = new MutationObserver(() => { frame(); observe() })
    const observe = () => {
      watch.observe(wrap)
      watch.observe(board)
      for (const el of pot.querySelectorAll('.pile-label, .pile')) watch.observe(el)
    }
    if (active) {
      observe()
      changed.observe(pot, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
      pot.addEventListener('transitionend', frame)
    }
    return () => { watch.disconnect(); changed.disconnect(); pot.removeEventListener('transitionend', frame); clearTimeout(close) }
  }, [active, ref])
}

export function HandReveal({ game, nameOf }: { game: TableGame; nameOf: (seat: number) => string }) {
  const reveal = game.reveal!
  return (
    <div
      key={reveal.key}
      className="hand-reveal"
      data-hands={reveal.seats.length}
      style={{ '--reveal-ms': `${REVEAL_MS}ms`, '--reveal-flip': `${REVEAL_FLIP_MS}ms` } as CSSProperties}
      role="group"
      aria-label="Revealed hands"
    >
      <div className="reveal-panes" data-hands={reveal.seats.length}>
        {reveal.seats.map((seat) => {
          const player = game.view.seats[seat]!
          return (
            <section className="reveal-pane" key={player.id} aria-label={`${nameOf(seat)}'s hand`}>
              <div className="reveal-cards">
                {player.cards.map((card, k) => <PlayingCard key={k} card={card} delay={REVEAL_FLIP_MS} />)}
              </div>
              <div className="reveal-player">
                <Avatar id={player.id} art={game.artOf?.(seat)} />
                <span>{nameOf(seat)}</span>
              </div>
            </section>
          )
        })}
      </div>
      <div className="reveal-context">
        <span className="reveal-pot">Pot {potSize(game.view).toLocaleString('en-US')}</span>
        {game.board.length > 0 && (
          <div className="reveal-board" role="group" aria-label="Community cards">
            {game.board.map((card, i) => <PlayingCard key={i} card={card} silent />)}
          </div>
        )}
      </div>
    </div>
  )
}
