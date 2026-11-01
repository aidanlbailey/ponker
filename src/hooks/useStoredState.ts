import { useEffect, useState } from 'react'
import { load, save } from '../lib/storage'

export function useStoredState<T>(key: string, fallback: T, isValid?: (data: unknown) => data is T) {
  const [value, setValue] = useState(() => load(key, fallback, isValid))

  useEffect(() => {
    save(key, value)
  }, [key, value])

  return [value, setValue] as const
}
