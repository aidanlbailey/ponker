import { decide, equity, XI } from './bot'
import { botById } from './roster'
import type { WorkerRequest } from './solo'

const HELPER_SIMS = 4000

self.onmessage = ({ data }: MessageEvent<WorkerRequest & { id: number }>) => {
  const result =
    data.kind === 'decide'
      ? decide(data.view, Math.random, undefined, botById(data.bot)?.settings ?? XI)
      : equity(data.cards, data.board, data.opponents, HELPER_SIMS)
  self.postMessage({ id: data.id, result })
}
