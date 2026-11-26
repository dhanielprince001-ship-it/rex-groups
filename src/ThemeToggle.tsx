import { Moon, Sun } from 'lucide-react'

import { useTheme } from './ThemeContext'

// One shared light/dark button, used by the main site and every
// marketplace page.
export default function ThemeToggle({
  className = 'rex-market-theme-toggle',
  size = 18,
}: {
  className?: string
  size?: number
}) {
  const { theme, toggleTheme } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className={className}
      onClick={toggleTheme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? (
        <Sun size={size} aria-hidden="true" />
      ) : (
        <Moon size={size} aria-hidden="true" />
      )}
    </button>
  )
}
