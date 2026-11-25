import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Package,
  RefreshCw,
  TrendingUp,
} from 'lucide-react'

import { useAuth } from './AuthPanel'

export type SoldOrder = {
  id: string
  paymentStatus: string
  status: string
  subtotal: number
  sellerNetAmount: number
  items: {
    productId: string
    name: string
    unitPrice?: number
    price?: number
    lineTotal?: number
    quantity: number
    imageUrl?: string
  }[]
}

type SellerEnquiry = {
  id: string
  productName: string
  customerName: string
  customerEmail: string
  message: string
  status: string
  reply: string
  createdAt: { seconds?: number } | null
  repliedAt: { seconds?: number } | null
}

const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
})

function formatDate(value: { seconds?: number } | null) {
  return value?.seconds
    ? new Date(value.seconds * 1000).toLocaleString()
    : 'Date unavailable'
}

type Tab = 'sold' | 'enquiries'

// Seller dashboard: goods sold (from the seller's paid orders) and
// the enquiry inbox where buyers' questions are answered.
export default function SellerInsights({
  orders,
  loadingOrders,
}: {
  orders: SoldOrder[]
  loadingOrders: boolean
}) {
  const { user } = useAuth()

  const [tab, setTab] = useState<Tab>('sold')

  const [enquiries, setEnquiries] = useState<SellerEnquiry[]>([])
  const [loadingEnquiries, setLoadingEnquiries] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState('')

  // ----- Goods sold -----
  const sold = useMemo(() => {
    const paid = orders.filter((order) => order.paymentStatus === 'Paid')

    const byProduct = new Map<
      string,
      { name: string; units: number; revenue: number; orders: number; imageUrl?: string }
    >()

    for (const order of paid) {
      for (const item of order.items || []) {
        const unit = item.unitPrice ?? item.price ?? 0
        const line = item.lineTotal ?? unit * item.quantity

        const entry = byProduct.get(item.productId) || {
          name: item.name,
          units: 0,
          revenue: 0,
          orders: 0,
          imageUrl: item.imageUrl,
        }

        entry.units += item.quantity
        entry.revenue += line
        entry.orders += 1

        byProduct.set(item.productId, entry)
      }
    }

    const rows = Array.from(byProduct.entries())
      .map(([productId, value]) => ({ productId, ...value }))
      .sort((a, b) => b.units - a.units)

    return {
      rows,
      paidOrders: paid.length,
      awaitingPayment: orders.length - paid.length,
      units: rows.reduce((total, row) => total + row.units, 0),
      earnings: paid.reduce(
        (total, order) => total + (order.sellerNetAmount || 0),
        0,
      ),
      delivered: paid.filter((order) => order.status === 'Delivered').length,
    }
  }, [orders])

  // ----- Enquiries -----
  const loadEnquiries = useCallback(async () => {
    if (!user) return

    setLoadingEnquiries(true)

    try {
      const token = await user.getIdToken()

      const response = await fetch('/api/seller-enquiries?role=seller', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to load enquiries.')
      }

      setEnquiries(Array.isArray(data.enquiries) ? data.enquiries : [])
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load enquiries.',
      )
    } finally {
      setLoadingEnquiries(false)
    }
  }, [user])

  useEffect(() => {
    void loadEnquiries()
  }, [loadEnquiries])

  async function updateEnquiry(
    enquiry: SellerEnquiry,
    status: 'Replied' | 'Closed',
  ) {
    if (!user) return

    const reply = (replyDrafts[enquiry.id] ?? '').trim()

    if (status === 'Replied' && reply.length < 2) {
      setError('Write a reply before sending.')
      return
    }

    setBusyId(enquiry.id)
    setError('')
    setMessage('')

    try {
      const token = await user.getIdToken()

      const response = await fetch('/api/seller-enquiries', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enquiryId: enquiry.id,
          status,
          reply,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to update this enquiry.')
      }

      setMessage(data.message || 'Enquiry updated.')

      setReplyDrafts((current) => {
        const next = { ...current }
        delete next[enquiry.id]
        return next
      })

      await loadEnquiries()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to update this enquiry.',
      )
    } finally {
      setBusyId('')
    }
  }

  const newCount = enquiries.filter((item) => item.status === 'New').length

  return (
    <div className="seller-insights">
      <div className="seller-orders-heading">
        <div>
          <span className="marketplace-eyebrow">STORE MANAGEMENT</span>
          <h3>Sales &amp; enquiries</h3>
          <p>See what you have sold and answer questions from buyers.</p>
        </div>
      </div>

      <div className="seller-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'sold'}
          className={tab === 'sold' ? 'seller-tab active' : 'seller-tab'}
          onClick={() => setTab('sold')}
        >
          <TrendingUp size={16} /> Goods sold
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === 'enquiries'}
          className={tab === 'enquiries' ? 'seller-tab active' : 'seller-tab'}
          onClick={() => setTab('enquiries')}
        >
          <MessageSquare size={16} /> Enquiries
          {newCount > 0 && <b className="seller-tab-badge">{newCount}</b>}
        </button>
      </div>

      {error && (
        <div className="marketplace-error" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {message && (
        <div className="marketplace-success" role="status">
          <CheckCircle2 size={18} />
          {message}
        </div>
      )}

      {tab === 'sold' && (
        <>
          {loadingOrders ? (
            <div className="marketplace-loading">
              <Loader2 className="marketplace-spinner" size={24} />
              <p>Loading your sales...</p>
            </div>
          ) : (
            <>
              <div className="seller-stats">
                <div>
                  <span>Units sold</span>
                  <strong>{sold.units}</strong>
                </div>
                <div>
                  <span>Paid orders</span>
                  <strong>{sold.paidOrders}</strong>
                </div>
                <div>
                  <span>Delivered</span>
                  <strong>{sold.delivered}</strong>
                </div>
                <div>
                  <span>Your earnings</span>
                  <strong>{naira.format(sold.earnings)}</strong>
                </div>
              </div>

              {sold.awaitingPayment > 0 && (
                <p className="seller-order-payment-notice">
                  {sold.awaitingPayment} order
                  {sold.awaitingPayment === 1 ? ' is' : 's are'} still awaiting
                  payment and not counted below. Confirm payment on the order to
                  start fulfilment.
                </p>
              )}

              {sold.rows.length === 0 ? (
                <div className="seller-empty-products">
                  <Package size={38} />
                  <h4>Nothing sold yet</h4>
                  <p>Products from paid orders will be listed here.</p>
                </div>
              ) : (
                <div className="seller-sold-list">
                  {sold.rows.map((row) => (
                    <article className="seller-sold-row" key={row.productId}>
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt={row.name} />
                      ) : (
                        <div className="seller-sold-placeholder">
                          <Package size={22} />
                        </div>
                      )}

                      <div>
                        <strong>{row.name}</strong>
                        <p>
                          {row.units} sold across {row.orders} order
                          {row.orders === 1 ? '' : 's'}
                        </p>
                      </div>

                      <strong>{naira.format(row.revenue)}</strong>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'enquiries' && (
        <>
          <div className="seller-enquiries-toolbar">
            <span>
              {enquiries.length} enquir{enquiries.length === 1 ? 'y' : 'ies'}
            </span>

            <button
              type="button"
              className="marketplace-button"
              onClick={() => void loadEnquiries()}
              disabled={loadingEnquiries}
            >
              {loadingEnquiries ? (
                <Loader2 className="marketplace-spinner" size={18} />
              ) : (
                <RefreshCw size={18} />
              )}
              Refresh
            </button>
          </div>

          {loadingEnquiries && enquiries.length === 0 ? (
            <div className="marketplace-loading">
              <Loader2 className="marketplace-spinner" size={24} />
              <p>Loading enquiries...</p>
            </div>
          ) : enquiries.length === 0 ? (
            <div className="seller-empty-products">
              <MessageSquare size={38} />
              <h4>No enquiries yet</h4>
              <p>Questions from buyers visiting your store appear here.</p>
            </div>
          ) : (
            <div className="seller-enquiry-list">
              {enquiries.map((item) => (
                <article className="seller-enquiry" key={item.id}>
                  <div className="seller-enquiry-top">
                    <div>
                      <strong>{item.customerName}</strong>
                      <small>
                        {item.customerEmail} · {formatDate(item.createdAt)}
                      </small>
                    </div>

                    <span
                      className={`seller-enquiry-status ${item.status.toLowerCase()}`}
                    >
                      {item.status}
                    </span>
                  </div>

                  {item.productName && (
                    <p className="seller-enquiry-product">
                      About: {item.productName}
                    </p>
                  )}

                  <p className="seller-enquiry-message">{item.message}</p>

                  {item.reply && (
                    <div className="seller-enquiry-reply">
                      <strong>Your reply</strong>
                      <p>{item.reply}</p>
                      <small>{formatDate(item.repliedAt)}</small>
                    </div>
                  )}

                  {item.status !== 'Closed' && (
                    <div className="seller-enquiry-actions">
                      <textarea
                        rows={3}
                        maxLength={1000}
                        placeholder={
                          item.reply ? 'Update your reply...' : 'Write a reply...'
                        }
                        value={replyDrafts[item.id] ?? ''}
                        onChange={(e) =>
                          setReplyDrafts((current) => ({
                            ...current,
                            [item.id]: e.target.value,
                          }))
                        }
                        disabled={busyId === item.id}
                      />

                      <div>
                        <button
                          type="button"
                          className="marketplace-button"
                          onClick={() => void updateEnquiry(item, 'Replied')}
                          disabled={busyId === item.id}
                        >
                          {busyId === item.id ? 'Sending...' : 'Send reply'}
                        </button>

                        <button
                          type="button"
                          className="seller-link-button"
                          onClick={() => void updateEnquiry(item, 'Closed')}
                          disabled={busyId === item.id}
                        >
                          Close enquiry
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
