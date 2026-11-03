import { useEffect, useEffectEvent } from 'react'
import { applyAction, shuffledDeck, viewFor, type Action, type PlayerAction } from '../engine/engine'
import { useStoredState } from '../hooks/useStoredState'
import { haptic } from '../lib/haptics'
import { botById } from './roster'
import { botAction, endOfHand, HERO, isSolo, newSolo, setLeaving, startHand, STORAGE_KEY, type Solo } from './solo'
import { ask, useStage, type TableGame } from './useStage'
import { save } from '../lib/storage'

const FRESH = newSolo()
const THINK_MS = 700
const THINK_SPREAD_MS = 900
// folds come quick or a six handed orbit drags
const FOLD_MS = 350
const FOLD_SPREAD_MS = 400
const SITTING_OUT_MS = 500

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms))

// The table loop for a solo game, with the bots in a worker. The staging is all useStage's.
export function useSoloTable(): TableGame {
  const [solo, setSolo] = useStoredState<Solo>(STORAGE_KEY, FRESH, isSolo)
  const { table } = solo
  // a reload after the payout shouldn't play it again. A held leave or top-up means the hand
  // end never ran though, so that one does replay, it's what applies them
  const stage = useStage(table, HERO, table.street === 'complete' && !solo.leaving && !solo.topUp, () => {
    if (!solo.leaving) setSolo(endOfHand)
  })

  const run = (action: Action, seat: number, from?: DOMRect) => {
    const next = applyAction(table, action)
    stage.acted(next, action, seat, from)
    setSolo((prev) => ({ ...prev, table: next }))
  }

  const act = (action: PlayerAction, from?: DOMRect) => {
    haptic('light')
    run(action, HERO, from)
  }

  const deal = () => {
    if (!stage.idle) return
    const next = startHand(table, shuffledDeck())
    stage.dealt(next)
    setSolo((prev) => ({ ...prev, table: next }))
  }

  const toggleTopUp = () => {
    if (stage.idle) setSolo((prev) => endOfHand({ ...prev, topUp: true }))
    else setSolo((prev) => ({ ...prev, topUp: !prev.topUp }))
  }

  // saved by hand: the hash change unmounts this before useStoredState's effect gets to run,
  // and a stale leaving flag would throw you straight back out next time you sit down
  const exit = () => {
    save(STORAGE_KEY, null)
    location.hash = ''
  }

  const toggleLeaving = () => {
    if (stage.idle) exit()
    else setSolo((prev) => setLeaving(prev, !prev.leaving))
  }

  const onBotAnswer = useEffectEvent((answer: PlayerAction | null) => run(botAction(table, answer), table.toAct))
  const onSittingOut = useEffectEvent(() => run({ type: 'timeout' }, table.toAct))

  // nobody acts while anything's staged
  const toAct = stage.dealing || stage.moving ? -1 : table.toAct

  useEffect(() => {
    if (toAct < 0 || toAct === HERO) return
    let stale = false
    const started = performance.now()
    ask<PlayerAction>(stage.worker.current, { kind: 'decide', view: viewFor(table, toAct), bot: table.seats[toAct]!.id })
      .catch(() => null)
      .then(async (answer) => {
        const think =
          answer?.type === 'fold'
            ? FOLD_MS + Math.random() * FOLD_SPREAD_MS
            : THINK_MS + Math.random() * THINK_SPREAD_MS
        await wait(think - (performance.now() - started))
        if (!stale) onBotAnswer(answer)
      })
    return () => {
      stale = true
    }
  }, [toAct, table, stage.worker])

  useEffect(() => {
    if (toAct < 0 || !table.seats[toAct]!.sittingOut) return
    const timer = setTimeout(onSittingOut, SITTING_OUT_MS)
    return () => clearTimeout(timer)
  }, [toAct, table])

  // leaving waits for the winnings to land, not just to set off
  const onLeft = useEffectEvent(exit)
  useEffect(() => {
    if (stage.over && stage.paid && solo.leaving && !stage.moving) onLeft()
  }, [stage.over, stage.paid, solo.leaving, stage.moving])

  return {
    ...stage,
    me: HERO,
    act,
    deal,
    bustLeaves: true,
    nameOf: (seat) => botById(table.seats[seat]?.id ?? '')?.name ?? 'Bot',
    leaving: solo.leaving,
    topUp: solo.topUp,
    toggleTopUp,
    toggleLeaving,
  }
}
