// string settings were always stored raw, not as JSON, so they stay that way or saved data breaks
export function load<T>(key: string, fallback: T, isValid?: (data: unknown) => data is T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const data: unknown = typeof fallback === 'string' ? raw : JSON.parse(raw)
    const valid = isValid ? isValid(data) : typeof data === typeof fallback
    return valid ? (data as T) : fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
  } catch {
    // storage blocked or full, the app still works for this session
  }
}
