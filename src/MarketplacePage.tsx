import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import Marketplace from './Marketplace'

type Theme = 'dark' | 'light'

// The seller dashboard renders outside SiteLayout, so it must apply the
// theme itself: the colour variables (--text, --surface, --line...) are
// only defined on the `.app` wrapper.
function getStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem('rex-theme')

    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    // Storage unavailable
  }

  return window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

export default function MarketplacePage() {
  const [theme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <div className={`app ${theme} marketplace-page`}>
      <header className="marketplace-page-bar">
        <Link to="/marketplace">← Back to marketplace</Link>
        <Link to="/">Rex Groups</Link>
      </header>

      <Marketplace />
    </div>
  )
}
