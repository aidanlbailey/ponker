import { useEffect, useState } from 'react'
import { hiddenArt, syncHiddenArt } from '../lib/account'

export function useHiddenArt() {
  const [ids, setIds] = useState(hiddenArt)
  useEffect(() => {
    const update = () => setIds(hiddenArt())
    addEventListener('hidden-art', update)
    addEventListener('storage', update)
    return () => {
      removeEventListener('hidden-art', update)
      removeEventListener('storage', update)
    }
  }, [])
  return ids
}

export function useHiddenArtSync() {
  useEffect(() => {
    const sync = () => { void syncHiddenArt().catch(() => {}) }
    const visible = () => { if (!document.hidden) sync() }
    sync()
    addEventListener('focus', sync)
    addEventListener('visibilitychange', visible)
    return () => {
      removeEventListener('focus', sync)
      removeEventListener('visibilitychange', visible)
    }
  }, [])
}
