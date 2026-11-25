import { Link, Route, Routes } from 'react-router-dom'

import SiteLayout from './SiteLayout'
import HomePage from './HomePage'
import MarketplacePage from './MarketplacePage'

function NotFound() {
  return (
    <section className="section-wrap section-block not-found">
      <div className="section-kicker">404</div>

      <h2>
        Page <em>not found.</em>
      </h2>

      <p>The page you are looking for does not exist or has moved.</p>

      <Link className="button button-primary" to="/">
        Back to home
      </Link>
    </section>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="marketplace" element={<MarketplacePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
