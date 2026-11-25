import { Link, useLocation } from 'react-router-dom'
import { Package } from 'lucide-react'

// Floating shortcut that is available on every page, so a buyer can open
// their orders at any time. Signed-out visitors are asked to sign in on the
// orders page itself, and are brought straight back afterwards.
export default function TrackOrderButton() {
  const { pathname } = useLocation()

  // No need to show it on the page it points to.
  if (pathname === '/marketplace/orders') return null

  return (
    <Link
      to="/marketplace/orders"
      className="rex-track-fab"
      aria-label="Track my orders"
    >
      <Package size={18} aria-hidden="true" />
      <span>Track my order</span>
    </Link>
  )
}
