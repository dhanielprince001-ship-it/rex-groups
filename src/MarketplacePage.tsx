
import { Link } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'

import Marketplace from './Marketplace'
import { useTheme } from './ThemeContext'

export default function MarketplacePage() {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className={`app ${theme} marketplace-page`}>
      <header className="marketplace-page-bar">
        <Link to="/marketplace">
          ← Back to marketplace
        </Link>

        <div className="marketplace-page-actions">
          <button
            type="button"
            className="rex-market-theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? (
              <Sun size={19} />
            ) : (
              <Moon size={19} />
            )}
          </button>

          <Link to="/">
            Rex Groups
          </Link>
        </div>
      </header>

      <Marketplace />
    </div>
  )
}
