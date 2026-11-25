
import { Link, Route, Routes } from 'react-router-dom'

import SiteLayout from './SiteLayout'
import HomePage from './HomePage'
import MarketplacePage from './MarketplacePage'
import MarketplaceHome from './MarketplaceHome'
import MarketplaceCart from './MarketplaceCart'
import MarketplaceStore from './MarketplaceStore'
import MarketplaceCheckout from './MarketplaceCheckout'
import { CartProvider } from './CartContext'

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
    <CartProvider>
      <Routes>
        {/* CORPORATE WEBSITE */}
        <Route element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* MARKETPLACE */}
        <Route
          path="/marketplace"
          element={<MarketplaceHome />}
        />

        {/* SHOPPING CART */}
        <Route
          path="/marketplace/cart"
          element={<MarketplaceCart />}
        />

        {/* CHECKOUT */}
        <Route
          path="/marketplace/checkout"
          element={<MarketplaceCheckout />}
        />

        {/* SELLER DASHBOARD */}
        <Route
          path="/marketplace/seller"
          element={<MarketplacePage />}
        />

        {/* PUBLIC STORE */}
        <Route
          path="/marketplace/store/:storeId"
          element={<MarketplaceStore />}
        />

        {/* PRODUCT PAGE */}
        <Route
          path="/marketplace/product/:productId"
          element={
            <MarketplacePlaceholder
              title="Product page coming next."
            />
          }
        />
      </Routes>
    </CartProvider>
  )
}
