
import { useMemo } from 'react'
import './seller-earnings.css'

interface EarningsOrder {
  paymentStatus: string
  status: string
  payoutStatus?: string
  sellerNetAmount: number
  createdAt?: { seconds?: number }
}

const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
})

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Where is the seller's money? Built from the seller's own orders.
export default function SellerEarnings({ orders }: { orders: EarningsOrder[] }) {
  const stats = useMemo(() => {
    const totals = { paidOut: 0, ready: 0, held: 0, disputed: 0, inProgress: 0 }
    let paidOrders = 0

    // Last 6 months, oldest first.
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], value: 0 }
    })

    for (const order of orders) {
      if (order.paymentStatus !== 'Paid' || order.status === 'Cancelled' || order.payoutStatus === 'Cancelled') continue

      const net = Number(order.sellerNetAmount) || 0
      paidOrders++

      if (order.payoutStatus === 'Paid Out') totals.paidOut += net
      else if (order.payoutStatus === 'Released') totals.ready += net
      else if (order.payoutStatus === 'Disputed') totals.disputed += net
      else if (order.status === 'Shipped' || order.status === 'Delivered') totals.held += net
      else totals.inProgress += net

      if (order.createdAt?.seconds) {
        const d = new Date(order.createdAt.seconds * 1000)
        const slot = months.find((m) => m.key === `${d.getFullYear()}-${d.getMonth()}`)
        if (slot) slot.value += net
      }
    }

    return { ...totals, paidOrders, months, max: Math.max(1, ...months.map((m) => m.value)) }
  }, [orders])

  const cards: [string, number, string][] = [
    ['Paid out to you', stats.paidOut, 'Already sent to your account'],
    ['Ready to be paid', stats.ready, 'Buyer confirmed. Payout is on its way'],
    ['Waiting for buyer', stats.held, 'Shipped. Released when the buyer confirms'],
    ['In progress', stats.inProgress, 'Paid, but not yet shipped'],
  ]

  return (
    <div className="seller-earnings">
      <div className="seller-earnings-head">
        <strong>Your earnings</strong>
        <small>{stats.paidOrders} paid order{stats.paidOrders === 1 ? '' : 's'} · amounts are after commission</small>
      </div>

      <div className="seller-earnings-grid">
        {cards.map(([label, value, hint]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{naira.format(value)}</strong>
            <small>{hint}</small>
          </div>
        ))}
      </div>

      {stats.disputed > 0 && (
        <p className="seller-earnings-warn">
          {naira.format(stats.disputed)} is on hold because a buyer reported a problem. Reply in the order's conversation.
        </p>
      )}

      <div className="seller-earnings-chart" role="img" aria-label="Earnings by month">
        {stats.months.map((m) => (
          <div key={m.key} title={`${m.label}: ${naira.format(m.value)}`}>
            <i style={{ height: `${Math.max(m.value ? 6 : 2, (m.value / stats.max) * 100)}%` }} />
            <span>{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
