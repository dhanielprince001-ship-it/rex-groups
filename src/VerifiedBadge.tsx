import { BadgeCheck } from 'lucide-react'

// Shown on stores whose identity and bank account were checked by Rex Groups.
export default function VerifiedBadge() {
  return (
    <span
      className="rex-verified-badge"
      title="Rex Groups has checked this seller's identity and bank account"
    >
      <BadgeCheck size={15} aria-hidden="true" /> Verified seller
    </span>
  )
}
