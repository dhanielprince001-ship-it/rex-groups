
import { useEffect, type ReactNode } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'

import SiteLayout from './SiteLayout'
import HomePage from './HomePage'
import MarketplacePage from './MarketplacePage'
import MarketplaceHome from './MarketplaceHome'
import MarketplaceCart from './MarketplaceCart'
import MarketplaceStore from './MarketplaceStore'
import MarketplaceCheckout from './MarketplaceCheckout'
import MarketplaceOrders from './MarketplaceOrders'
import TrackOrderButton from './TrackOrderButton'
import { CartProvider } from './CartContext'
import { ThemeProvider } from './ThemeContext'

const BASE_TITLE = 'Rex Groups'

function getPageTitle(pathname: string) {
  if (pathname === '/') {
    return 'Rex Groups | Technology. Business. Innovation.'
  }

  if (pathname === '/marketplace') return `Marketplace | ${BASE_TITLE}`
  if (pathname === '/marketplace/cart') return `Cart | ${BASE_TITLE}`
  if (pathname === '/marketplace/checkout') return `Checkout | ${BASE_TITLE}`
  if (pathname === '/marketplace/orders') return `My orders | ${BASE_TITLE}`
  if (pathname === '/marketplace/seller') return `Sell on Marketplace | ${BASE_TITLE}`
  if (pathname.startsWith('/marketplace/store/')) return `Store | ${BASE_TITLE}`
  if (pathname.startsWith('/marketplace/product/')) return `Product | ${BASE_TITLE}`

  return `Page not found | ${BASE_TITLE}`
}

function RouteEffects() {
  const { pathname, hash, key } = useLocation()

  useEffect(() => {
    document.title = getPageTitle(pathname)
  }, [pathname])

  useEffect(() => {
    if (!hash) {
      const root = document.documentElement
      root.style.scrollBehavior = 'auto'
      window.scrollTo(0, 0)
      root.style.scrollBehavior = ''
      return
    }

    let id = hash.slice(1)

    try {
      id = decodeURIComponent(id)
    } catch {
      // Keep the raw hash.
    }

    let attempts = 0
    let timer = 0

    const tryScroll = () => {
      const target = document.getElementById(id)

      if (target) {
        target.scrollIntoView()
        return
      }

      if (attempts++ < 20) {
        timer = window.setTimeout(tryScroll, 50)
      }
    }

    tryScroll()

    return () => window.clearTimeout(timer)
  }, [pathname, hash, key])

  return null
}

function MarketplaceRoute({
  children,
}: {
  children: ReactNode
}) {
  return (
    <>
      <TrackOrderButton />
      {children}
    </>
  )
}

function NotFound() {
  return (
    <section className="section-wrap section-block not-found">
      <div className="section-kicker">404</div>

      <h2>
        Page <em>not found.</em>
      </h2>

      <p>
        The page you are looking for does not exist or has moved.
      </p>

      <Link className="button button-primary" to="/">
        Back to home
      </Link>
    </section>
  )
}

function MarketplacePlaceholder({
  title,
}: {
  title: string
}) {
  return (
    <main className="rex-marketplace rex-marketplace-placeholder">
      <header className="rex-market-header">
        <Link className="rex-market-brand" to="/marketplace">
          <span className="rex-market-brand-mark">
            R<span>.</span>
          </span>

          <span>
            REX <b>MARKETPLACE</b>
          </span>
        </Link>

        <Link to="/marketplace">
          Back to marketplace
        </Link>
      </header>

      <section className="rex-market-placeholder-content">
        <span className="rex-market-eyebrow">
          REX GROUPS MARKETPLACE
        </span>

        <h1>{title}</h1>

        <p>
          This page is the next part of the marketplace build.
        </p>

        <Link
          className="rex-market-primary-link"
          to="/marketplace"
        >
          Explore marketplace
        </Link>
      </section>
    </main>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <CartProvider>
        <RouteEffects />

        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<HomePage />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          <Route
            path="/marketplace"
            element={
              <MarketplaceRoute>
                <MarketplaceHome />
              </MarketplaceRoute>
            }
          />

          <Route
            path="/marketplace/cart"
            element={
              <MarketplaceRoute>
                <MarketplaceCart />
              </MarketplaceRoute>
            }
          />

          <Route
            path="/marketplace/checkout"
            element={
              <MarketplaceRoute>
                <MarketplaceCheckout />
              </MarketplaceRoute>
            }
          />

          <Route
            path="/marketplace/orders"
            element={
              <MarketplaceRoute>
                <MarketplaceOrders />
              </MarketplaceRoute>
            }
          />

          <Route
            path="/marketplace/seller"
            element={
              <MarketplaceRoute>
                <MarketplacePage />
              </MarketplaceRoute>
            }
          />

          <Route
            path="/marketplace/store/:storeId"
            element={
              <MarketplaceRoute>
                <MarketplaceStore />
              </MarketplaceRoute>
            }
          />

          <Route
            path="/marketplace/product/:productId"
            element={
              <MarketplaceRoute>
                <MarketplacePlaceholder title="Product page coming next." />
              </MarketplaceRoute>
            }
          />
        </Routes>
      </CartProvider>
    </ThemeProvider>
  )
}
