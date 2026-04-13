import { useState, useEffect } from 'react'

export type Theme = 'night' | 'day'

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem('plaster-theme') as Theme | null
      const resolved = stored ?? 'night'
      // Apply synchronously in the initializer to avoid a flash on first load
      applyTheme(resolved)
      return resolved
    } catch {
      return 'night'
    }
  })

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem('plaster-theme', theme)
    } catch {}
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'night' ? 'day' : 'night'))

  return { theme, setTheme, toggle }
}
