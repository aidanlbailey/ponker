const PATTERNS = { light: 10, success: [50, 50, 50], error: [100, 50, 100] }

// iOS Safari has no vibrate at all, despite what the types say
export const haptic = (type: keyof typeof PATTERNS) => navigator.vibrate?.(PATTERNS[type])
