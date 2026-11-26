import { Link } from 'react-router-dom'

import Marketplace from './Marketplace'
import { useTheme } from './ThemeContext'
import ThemeToggle from './ThemeToggle'

export default function MarketplacePage() {
  const { theme } = useTheme()

  return (
    <div className={`app ${theme} marketplace-page`}>
      <header className="marketplace-page-bar">
        <Link to="/marketplace">
          ← Back to marketplace
        </Link>

        <div className="marketplace-page-actions">
          <ThemeToggle size={19} />

          <Link to="/">
            Rex Groups
          </Link>
        </div>
      </header>

      <Marketplace />
    </div>
  )
}
