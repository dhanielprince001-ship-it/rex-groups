
import { useEffect, type ReactNode } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'

import SiteLayout from './SiteLayout'
import HomePage from './HomePage'
import BusinessDigitalSolutionsPage from './BusinessDigitalSolutionsPage'
import ClientDashboard from './ClientDashboard'
import ErrorBoundary from './ErrorBoundary'
import MarketplaceProduct from './MarketplaceProduct'
import AdminBdsDashboard from './AdminBdsDashboard'
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

  if (pathname === '/business-digital-solutions') {
    return `Business Digital Solutions | ${BASE_TITLE}`
  }

  if (pathname === '/business-digital-solutions/dashboard') {
    return `Client Dashboard | ${BASE_TITLE}`
  }

  if (pathname === '/business-digital-solutions/admin') {
    return `Digital Solutions Admin | ${BASE_TITLE}`
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

// Resets the error screen whenever the visitor navigates to another page.
function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
}

export default function App() {
  return (
    <ThemeProvider>
      <CartProvider>
        <RouteEffects />

        <RouteBoundary>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<HomePage />} />
            <Route
              path="/business-digital-solutions"
              element={<BusinessDigitalSolutionsPage />}
            />
            <Route
              path="/business-digital-solutions/dashboard"
              element={<ClientDashboard />}
            />
            <Route
              path="/business-digital-solutions/admin"
              element={<AdminBdsDashboard />}
            />
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
                <MarketplaceProduct />
              </MarketplaceRoute>
            }
          />
        </Routes>
        </RouteBoundary>
      </CartProvider>
    </ThemeProvider>
  )
}
