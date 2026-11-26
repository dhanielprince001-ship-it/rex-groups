import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'dark' | 'light'

type ThemeContextType = {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

const STORAGE_KEY = 'rex-theme'
const DARK_COLOR = '#0b0d10'
const LIGHT_COLOR = '#f5f6f3'

const ThemeContext = createContext<ThemeContextType | null>(null)

function readSavedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)

    if (saved === 'dark' || saved === 'light') {
      return saved
    }
  } catch {
    // Storage unavailable (private mode): fall back to the system setting.
  }

  return null
}

function getSystemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => readSavedTheme() ?? getSystemTheme(),
  )

  // Apply the theme to the page. Runs on every route because the provider
  // wraps the whole app, so the marketplace pages are themed too.
  useEffect(() => {
    document.documentElement.dataset.theme = theme

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? DARK_COLOR : LIGHT_COLOR)
  }, [theme])

  // Follow the device setting until the visitor makes their own choice.
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: light)')
    if (!query) return

    const onChange = () => {
      if (readSavedTheme() === null) {
        setThemeState(query.matches ? 'light' : 'dark')
      }
    }

    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // Keep several open tabs in sync.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return

      if (event.newValue === 'dark' || event.newValue === 'light') {
        setThemeState(event.newValue)
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Only an explicit choice is remembered.
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)

    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage unavailable: the choice still applies for this visit.
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  const value = useMemo(
    () => ({ theme, toggleTheme, setTheme }),
    [theme, toggleTheme, setTheme],
  )

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }

  return context
}
