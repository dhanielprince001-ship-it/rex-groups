
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageSquare,
  Package,
  RefreshCw,
  ShoppingBag,
  Truck,
} from 'lucide-react'

import { useAuth } from './AuthPanel'
import ThemeToggle from './ThemeToggle'
import './delivery-confirm.css'
import './pay-retry.css'
import DisputeThread from './DisputeThread'
import QuickRate from './QuickRate'

type Seconds = { seconds?: number } | null

type OrderPackage = {
  id: string
  storeName: string
  sellerId: string
  items: {
    productId: string
    name: string
    unitPrice?: number
    price?: number
    quantity: number
    imageUrl?: string
  }[]
  subtotal: number
  deliveryFee?: number
  deliveryLocation?: string
  status: string
  paymentStatus: string
  trackingNumber: string
  shippingCarrier: string
  paidAt: Seconds
  processingAt: Seconds
  shippedAt: Seconds
  deliveredAt: Seconds
  payoutStatus?: string
  autoReleaseAt?: Seconds
  total?: number
  refundStatus?: string
  refundedAmount?: number
  refundProviderStatus?: string
  refunds?: { amount: number; reason: string; mode: string; atMs: number }[]
}

type BuyerOrder = {
  id: string
  subtotal: number
  deliveryFee?: number | null
  status?: string
  paymentStatus?: string
  refundedAmount?: number
  createdAt: Seconds
  shippingAddress: {
    fullName?: string
    phone?: string
    streetAddress?: string
    city?: string
    state?: string
    country?: string
    postalCode?: string
  } | null
  packages: OrderPackage[]
}

type BuyerEnquiry = {
  id: string
  storeId: string
  storeName: string
  productName: string
  message: string
  status: string
  reply: string
  createdAt: Seconds
  repliedAt: Seconds
}

const money = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
})

const STEPS = [
  'Order placed',
  'Payment confirmed',
  'Processing',
  'Shipped',
  'Delivered',
]

const PROGRESS: Record<string, number> = {
  'Awaiting Payment': 1,
  'Awaiting Fulfilment': 2,
  Processing: 3,
  Shipped: 4,
  Delivered: 5,
}

function formatDate(value: Seconds) {
  return value?.seconds
    ? new Date(value.seconds * 1000).toLocaleString()
    : 'Date unavailable'
}

function stepDate(value: Seconds) {
  return value?.seconds
    ? new Date(value.seconds * 1000).toLocaleDateString()
    : ''
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {} as Record<string, unknown>
  }
}

function paymentClass(status: string | undefined) {
  if (status === 'Paid') return 'paid'
  if (status === 'Partially Paid' || status === 'Partially Refunded') return 'partial'
  if (status === 'Refunded') return 'refunded'

  return 'unpaid'
}

function refundProgress(pack: OrderPackage) {
  if (pack.refundProviderStatus === 'Processed') {
    return 'Processed by our payment provider. It can take a few business days to show in your bank account.'
  }

  if (pack.refundProviderStatus === 'Failed') {
    return 'Our payment provider could not complete this automatically. Rex Groups is following it up and will contact you.'
  }

  if (pack.refundProviderStatus === 'Processing' || pack.refundProviderStatus === 'Requested') {
    return 'On its way back to your original payment method. This can take a few business days.'
  }

  return 'Rex Groups will confirm once it reaches your account.'
}

function Header({ right }: { right: ReactNode }) {
  return (
    <header className="rex-market-header">
      <a className="rex-market-brand" href="/marketplace">
        <span className="rex-market-brand-mark">R<span>.</span></span>
        <span>REX <b>MARKETPLACE</b></span>
      </a>

      {right}

      <ThemeToggle />
    </header>
  )
}

export default function MarketplaceOrders() {
  const { user, ready } = useAuth()

  const [tab, setTab] = useState<'orders' | 'enquiries'>('orders')
  const [orders, setOrders] = useState<BuyerOrder[]>([])
  const [enquiries, setEnquiries] = useState<BuyerEnquiry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!user) return

    // A silent refresh keeps the list on screen (no flicker or jumping).
    if (!silent) setLoading(true)
    setError('')

    try {
      const token = await user.getIdToken()
      const headers = { Authorization: `Bearer ${token}` }

      const [orderResponse, enquiryResponse] = await Promise.all([
        fetch('/api/my-orders', { headers, cache: 'no-store' }),
        fetch('/api/seller-enquiries?role=buyer', {
          headers,
          cache: 'no-store',
        }),
      ])

      const orderData = await readJson(orderResponse)
      const enquiryData = await readJson(enquiryResponse)

      if (!orderResponse.ok) {
        throw new Error(
          typeof orderData.error === 'string'
            ? orderData.error
            : 'Unable to load your orders.',
        )
      }

      setOrders(
        Array.isArray(orderData.orders)
          ? (orderData.orders as BuyerOrder[])
          : [],
      )

      setEnquiries(
        enquiryResponse.ok && Array.isArray(enquiryData.enquiries)
          ? (enquiryData.enquiries as BuyerEnquiry[])
          : [],
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load your orders.',
      )
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
  }, [load])

  // Coming back from Paystack: re-check a few times while the webhook confirms payment.
  const [returning] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('payment') === 'return',
  )
  const [payingId, setPayingId] = useState('')
  const [payError, setPayError] = useState<{ id: string; text: string } | null>(null)

  useEffect(() => {
    if (!returning || !user) return

    let tries = 0
    const timer = window.setInterval(() => {
      tries += 1
      void load(true)
      if (tries >= 6) window.clearInterval(timer)
    }, 5000)

    return () => window.clearInterval(timer)
  }, [returning, user, load])

  const [cancellingId, setCancellingId] = useState('')

  async function cancelUnpaid(orderId: string) {
    if (!user || cancellingId) return

    if (
      !window.confirm(
        'Cancel this order? Nothing has been charged. You can place a new order any time.',
      )
    ) {
      return
    }

    setCancellingId(orderId)
    setPayError(null)

    try {
      const token = await user.getIdToken()

      const response = await fetch('/api/my-orders', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'cancel-unpaid', orderId }),
      })

      const data = await readJson(response)

      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Could not cancel this order.',
        )
      }

      await load(true)
    } catch (err) {
      setPayError({
        id: orderId,
        text: err instanceof Error ? err.message : 'Could not cancel this order.',
      })
    } finally {
      setCancellingId('')
    }
  }

  // Start (or restart) payment for an unpaid order.
  async function payNow(orderId: string) {
    if (!user || payingId) return

    setPayingId(orderId)
    setPayError(null)

    try {
      const token = await user.getIdToken()

      const response = await fetch('/api/payments-initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId }),
      })

      const data = await readJson(response)

      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Payment could not be started.',
        )
      }

      if (
        typeof data.authorizationUrl !== 'string' ||
        !data.authorizationUrl.startsWith('https://checkout.paystack.com/')
      ) {
        throw new Error('The payment provider returned an invalid checkout link.')
      }

      window.location.assign(data.authorizationUrl)
    } catch (err) {
      setPayError({
        id: orderId,
        text: err instanceof Error ? err.message : 'Payment could not be started.',
      })
      setPayingId('')
    }
  }

  const [actionBusy, setActionBusy] = useState('')
  const [disputeFor, setDisputeFor] = useState('')
  const [disputeText, setDisputeText] = useState('')
  const [actionMsg, setActionMsg] = useState('')

  async function respond(packId: string, action: 'confirm' | 'dispute') {
    if (!user) return

    if (
      action === 'confirm' &&
      !window.confirm(
        'Confirm you received this package? Payment will then be released to the seller.',
      )
    ) {
      return
    }

    setActionBusy(packId)
    setActionMsg('')

    try {
      const token = await user.getIdToken()

      const response = await fetch('/api/my-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sellerOrderId: packId,
          action,
          reason: disputeText,
        }),
      })

      const data = await readJson(response)

      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Could not update this order.',
        )
      }

      setDisputeFor('')
      setDisputeText('')
      setActionMsg(
        action === 'confirm'
          ? 'Thank you! Payment will now be released to the seller. Please rate the store below.'
          : 'Your report was sent. Our team will review it and contact you.',
      )

      await load()
    } catch (err) {
      setActionMsg(
        err instanceof Error ? err.message : 'Could not update this order.',
      )
    } finally {
      setActionBusy('')
    }
  }

  if (!ready) {
    return (
      <main className="rex-marketplace">
        <div className="rex-checkout-message">
          <Loader2 className="marketplace-spinner" size={28} />
          <p>Checking your account...</p>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="rex-marketplace">
        <Header right={<a href="/marketplace">Back to marketplace</a>} />

        <section className="rex-checkout-message">
          <ShoppingBag size={38} />
          <h1>Sign in to track your orders.</h1>
          <p>Your orders and seller replies are linked to your account.</p>
          <Link
            className="rex-market-primary-link"
            to="/?returnTo=%2Fmarketplace%2Forders#account"
          >
            Sign in or register
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="rex-marketplace rex-orders-page">
      <Header right={<a href="/marketplace">Continue shopping</a>} />

      <section className="rex-cart-content">
        <a className="rex-cart-back" href="/marketplace">
          <ArrowLeft size={16} /> Back to marketplace
        </a>

        <div className="rex-cart-heading">
          <div>
            <span className="rex-market-eyebrow">TRACK YOUR GOODS</span>
            <h1>My <em>orders.</em></h1>
          </div>

          <button
            type="button"
            className="rex-orders-refresh"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="marketplace-spinner" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
        </div>

        <div className="rex-orders-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'orders'}
            className={tab === 'orders' ? 'active' : ''}
            onClick={() => setTab('orders')}
          >
            <Package size={16} /> Orders ({orders.length})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'enquiries'}
            className={tab === 'enquiries' ? 'active' : ''}
            onClick={() => setTab('enquiries')}
          >
            <MessageSquare size={16} /> My enquiries ({enquiries.length})
          </button>
        </div>

        {error && (
          <div className="marketplace-error" role="alert">
            {error}
          </div>
        )}

        {loading && orders.length === 0 && enquiries.length === 0 ? (
          <div className="rex-market-state">
            <RefreshCw className="rex-market-spin" />
            Loading your orders…
          </div>
        ) : tab === 'orders' ? (
          orders.length === 0 ? (
            <div className="rex-cart-empty">
              <ShoppingBag size={42} />
              <h2>No orders yet.</h2>
              <p>When you place an order, you can follow it here.</p>
              <a className="rex-market-primary-link" href="/marketplace">
                Explore products
              </a>
            </div>
          ) : (
            <div className="rex-orders-list">
              {orders.map((order) => {
                const deliveryFee = order.deliveryFee
                const total = order.subtotal +
                  (typeof deliveryFee === 'number' ? deliveryFee : 0)

                return (
                  <article className="rex-order" key={order.id}>
                    <div className="rex-order-top">
                      <div>
                        <span className="rex-market-eyebrow">ORDER REFERENCE</span>
                        <h3>{order.id}</h3>
                        <small>Placed {formatDate(order.createdAt)}</small>
                      </div>

                      <strong>{money.format(total)}</strong>
                    </div>

                    <div className="rex-order-badges">
                      <span className="rex-package-status">
                        {order.status || 'Awaiting Payment'}
                      </span>
                      <span
                        className={`rex-pay-badge ${paymentClass(order.paymentStatus)}`}
                      >
                        Payment: {order.paymentStatus || 'Unpaid'}
                      </span>
                    </div>

                    {order.paymentStatus !== 'Paid' &&
                      order.status === 'Awaiting Payment' && (
                        <div className="rex-pay-retry">
                          {returning && (
                            <p role="status">
                              Checking your payment… If you cancelled or it did
                              not go through, you can pay again below.
                            </p>
                          )}

                          <p>
                            This order has not been paid yet. Pay now to send
                            it to the seller.
                          </p>

                          <button
                            type="button"
                            disabled={payingId === order.id}
                            onClick={() => void payNow(order.id)}
                          >
                            {payingId === order.id
                              ? 'Opening secure checkout…'
                              : `Pay ${money.format(total)} now`}
                          </button>

                          <button
                            type="button"
                            className="rex-pay-retry-cancel"
                            disabled={!!cancellingId || payingId === order.id}
                            onClick={() => void cancelUnpaid(order.id)}
                          >
                            {cancellingId === order.id ? 'Cancelling…' : 'Cancel this order'}
                          </button>

                          {payError?.id === order.id && (
                            <p className="rex-pay-retry-error" role="alert">
                              {payError.text}
                            </p>
                          )}
                        </div>
                      )}

                    <div className="rex-order-total">
                      <div>
                        <span>Products subtotal</span>
                        <strong>{money.format(order.subtotal)}</strong>
                      </div>

                      <div>
                        <span>Delivery fee</span>
                        <strong>
                          {typeof deliveryFee === 'number'
                            ? money.format(deliveryFee)
                            : 'Not yet calculated'}
                        </strong>
                      </div>

                      <div className="rex-order-grand-total">
                        <span>Order total</span>
                        <strong>{money.format(total)}</strong>
                      </div>

                      {(order.refundedAmount ?? 0) > 0 && (
                        <>
                          <div className="rex-order-refunded">
                            <span>Refunded to you</span>
                            <strong>
                              −{money.format(order.refundedAmount ?? 0)}
                            </strong>
                          </div>
                          <div className="rex-order-grand-total">
                            <span>You paid in total</span>
                            <strong>
                              {money.format(
                                Math.max(0, total - (order.refundedAmount ?? 0)),
                              )}
                            </strong>
                          </div>
                        </>
                      )}
                    </div>

                    {order.shippingAddress && (
                      <div className="rex-delivery">
                        <MapPin size={16} />
                        <div>
                          <strong>Delivering to</strong>
                          <p>
                            {[
                              order.shippingAddress.fullName,
                              order.shippingAddress.streetAddress,
                              order.shippingAddress.city,
                              order.shippingAddress.state,
                              order.shippingAddress.postalCode,
                              order.shippingAddress.country,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </p>
                          {order.shippingAddress.phone && (
                            <small>Phone: {order.shippingAddress.phone}</small>
                          )}
                        </div>
                      </div>
                    )}

                    {order.packages.length === 0 && (
                      <p className="rex-order-note">
                        Your order is being prepared. Check back shortly.
                      </p>
                    )}

                    {order.packages.map((pack) => {
                      const done = PROGRESS[pack.status] ?? 1

                      const stepDates = [
                        stepDate(order.createdAt),
                        stepDate(pack.paidAt),
                        stepDate(pack.processingAt),
                        stepDate(pack.shippedAt),
                        stepDate(pack.deliveredAt),
                      ]

                      return (
                        <div className="rex-package" key={pack.id}>
                          <div className="rex-package-head">
                            <strong>{pack.storeName}</strong>
                            <span className="rex-package-status">
                              {pack.status}
                            </span>
                          </div>

                          <p className="rex-package-pay">
                            <span
                              className={`rex-pay-badge ${
                                pack.refundStatus === 'Refunded'
                                  ? 'refunded'
                                  : pack.refundStatus
                                    ? 'partial'
                                    : paymentClass(pack.paymentStatus)
                              }`}
                            >
                              {pack.refundStatus === 'Refunded'
                                ? 'Refunded'
                                : pack.refundStatus === 'Partially refunded'
                                  ? 'Partially refunded'
                                  : pack.paymentStatus === 'Paid'
                                    ? 'Paid'
                                    : pack.paymentStatus || 'Unpaid'}
                            </span>

                            {pack.paidAt?.seconds ? (
                              <small>Confirmed {formatDate(pack.paidAt)}</small>
                            ) : null}

                            <b>{money.format(pack.subtotal)}</b>
                          </p>

                          {(pack.deliveryFee ?? 0) > 0 || pack.deliveryLocation ? (
                            <p className="rex-package-delivery">
                              Delivery
                              {pack.deliveryLocation
                                ? ` to ${pack.deliveryLocation}`
                                : ''}
                              :{' '}
                              <b>
                                {(pack.deliveryFee ?? 0) > 0
                                  ? money.format(pack.deliveryFee ?? 0)
                                  : 'Free'}
                              </b>
                            </p>
                          ) : null}

                          {pack.status === 'Delivered' &&
                            pack.sellerId &&
                            (pack.refundStatus !== 'Refunded') && (
                              <>
                                <QuickRate
                                  user={user}
                                  storeId={pack.sellerId}
                                  storeName={pack.storeName}
                                />
                                <Link
                                  className="rex-package-rate"
                                  to={`/marketplace/store/${pack.sellerId}#reviews`}
                                >
                                  See store reviews
                                </Link>
                              </>
                            )}

                          {(pack.refundedAmount ?? 0) > 0 && (
                            <div className="rex-refund-card" role="status">
                              <strong>
                                {pack.refundStatus === 'Refunded'
                                  ? `Refunded in full: ${money.format(pack.refundedAmount ?? 0)}`
                                  : `Partially refunded: ${money.format(pack.refundedAmount ?? 0)} of ${money.format(pack.total ?? 0)}`}
                              </strong>
                              <p>{refundProgress(pack)}</p>

                              {(pack.refunds ?? []).map((refund, index) => (
                                <small key={`${refund.atMs}-${index}`}>
                                  {money.format(refund.amount)}
                                  {refund.atMs
                                    ? ` · ${new Date(refund.atMs).toLocaleDateString()}`
                                    : ''}
                                  {refund.reason ? ` · ${refund.reason}` : ''}
                                </small>
                              ))}
                            </div>
                          )}

                          <ul className="rex-package-items">
                            {pack.items.map((item, index) => (
                              <li key={`${item.productId}-${index}`}>
                                {item.imageUrl ? (
                                  <img src={item.imageUrl} alt="" />
                                ) : (
                                  <ShoppingBag size={18} />
                                )}

                                <span>
                                  {item.name} × {item.quantity}
                                </span>

                                <b>
                                  {money.format(
                                    (item.unitPrice ?? item.price ?? 0) *
                                      item.quantity,
                                  )}
                                </b>
                              </li>
                            ))}
                          </ul>

                          {pack.status === 'Cancelled' ? (
                            <p className="rex-order-note">This order was cancelled.</p>
                          ) : (
                            <ol className="rex-tracker" aria-label="Order progress">
                            {STEPS.map((step, index) => (
                              <li
                                key={step}
                                className={
                                  index < done
                                    ? index === done - 1
                                      ? 'done current'
                                      : 'done'
                                    : ''
                                }
                              >
                                <i>
                                  {index < done ? (
                                    <CheckCircle2 size={16} />
                                  ) : (
                                    index + 1
                                  )}
                                </i>

                                <span>{step}</span>

                                {index < done && stepDates[index] && (
                                  <small>{stepDates[index]}</small>
                                )}
                              </li>
                            ))}
                          </ol>
                          )}

                          {pack.paymentStatus !== 'Paid' && pack.status !== 'Cancelled' && (
                            <p className="rex-order-note">
                              Waiting for secure payment confirmation. Your
                              order will move to fulfilment once payment is
                              verified. If you have completed payment, refresh
                              this page shortly.
                            </p>
                          )}

                          {pack.paymentStatus === 'Paid' &&
                            pack.refundStatus !== 'Refunded' &&
                            pack.status === 'Awaiting Fulfilment' && (
                              <p className="rex-order-note">
                                Payment confirmed. Your order is waiting for
                                the store to begin processing.
                              </p>
                            )}

                          {pack.trackingNumber && (
                            <p className="rex-tracking">
                              <Truck size={16} />
                              Tracking number:{' '}
                              <strong>{pack.trackingNumber}</strong>

                              {pack.shippingCarrier && (
                                <>
                                  {' '}· Carrier:{' '}
                                  <strong>{pack.shippingCarrier}</strong>
                                </>
                              )}
                            </p>
                          )}

                          {pack.shippedAt?.seconds &&
                            !pack.deliveredAt?.seconds && (
                              <p className="rex-order-note">
                                Shipped {formatDate(pack.shippedAt)}
                              </p>
                            )}

                          {pack.deliveredAt?.seconds && (
                            <p className="rex-order-note">
                              Delivered {formatDate(pack.deliveredAt)}
                            </p>
                          )}

                          {pack.paymentStatus === 'Paid' &&
                            pack.refundStatus !== 'Refunded' &&
                            (pack.status === 'Shipped' ||
                              pack.status === 'Delivered') && (
                              <div className="rex-receipt">
                                {pack.payoutStatus === 'Released' ? (
                                  <p className="rex-receipt-done">
                                    <CheckCircle2 size={16} /> You confirmed
                                    receipt. Payment has been released to the
                                    seller.
                                  </p>
                                ) : pack.payoutStatus === 'Refunded' ? (
                                  <p className="rex-receipt-done">
                                    <CheckCircle2 size={16} /> This order was
                                    refunded. It can take a few business days
                                    to reach your account.
                                  </p>
                                ) : pack.payoutStatus === 'Disputed' ? (
                                  <>
                                    <p className="rex-receipt-warn">
                                      You reported a problem. Payment is on hold
                                      while our team reviews it.
                                    </p>
                                    <DisputeThread
                                      user={user}
                                      orderId={pack.id}
                                      viewer="buyer"
                                      url="/api/my-orders"
                                      sendMethod="POST"
                                      sendExtra={{ action: 'message' }}
                                    />
                                  </>
                                ) : (
                                  <>
                                    <strong>
                                      Have you received this package?
                                    </strong>
                                    <p>
                                      The seller is only paid after you confirm
                                      {pack.autoReleaseAt?.seconds
                                        ? `, or automatically on ${new Date(
                                            pack.autoReleaseAt.seconds * 1000,
                                          ).toLocaleDateString()} if you report no problem`
                                        : ''}
                                      .
                                    </p>

                                    {disputeFor === pack.id ? (
                                      <div className="rex-receipt-form">
                                        <textarea
                                          rows={3}
                                          maxLength={500}
                                          value={disputeText}
                                          onChange={(e) =>
                                            setDisputeText(e.target.value)
                                          }
                                          placeholder="Describe the problem (not received, damaged, wrong item...)"
                                          aria-label="Describe the problem"
                                        />
                                        <div className="rex-receipt-actions">
                                          <button
                                            type="button"
                                            className="rex-receipt-danger"
                                            disabled={
                                              actionBusy === pack.id ||
                                              disputeText.trim().length < 10
                                            }
                                            onClick={() =>
                                              void respond(pack.id, 'dispute')
                                            }
                                          >
                                            {actionBusy === pack.id
                                              ? 'Sending...'
                                              : 'Send report'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setDisputeFor('')}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="rex-receipt-actions">
                                        <button
                                          type="button"
                                          className="rex-receipt-yes"
                                          disabled={actionBusy === pack.id}
                                          onClick={() =>
                                            void respond(pack.id, 'confirm')
                                          }
                                        >
                                          {actionBusy === pack.id
                                            ? 'Please wait...'
                                            : 'Yes, I received it'}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={actionBusy === pack.id}
                                          onClick={() => {
                                            setDisputeFor(pack.id)
                                            setActionMsg('')
                                          }}
                                        >
                                          Report a problem
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}

                                {actionMsg && (
                                  <p className="rex-receipt-msg" role="status">
                                    {actionMsg}
                                  </p>
                                )}
                              </div>
                            )}

                          <Link
                            className="rex-order-contact"
                            to={`/marketplace/store/${pack.sellerId}`}
                          >
                            Ask {pack.storeName} a question
                          </Link>
                        </div>
                      )
                    })}
                  </article>
                )
              })}
            </div>
          )
        ) : enquiries.length === 0 ? (
          <div className="rex-cart-empty">
            <MessageSquare size={42} />
            <h2>No enquiries yet.</h2>
            <p>Questions you send to stores and their replies appear here.</p>
            <a className="rex-market-primary-link" href="/marketplace">
              Browse stores
            </a>
          </div>
        ) : (
          <div className="rex-orders-list">
            {enquiries.map((item) => (
              <article className="rex-order" key={item.id}>
                <div className="rex-order-top">
                  <div>
                    <span className="rex-market-eyebrow">
                      {item.storeName.toUpperCase()}
                    </span>
                    <h3>{item.productName || 'General question'}</h3>
                    <small>Sent {formatDate(item.createdAt)}</small>
                  </div>

                  <span className="rex-package-status">{item.status}</span>
                </div>

                <p className="rex-enquiry-message">{item.message}</p>

                {item.reply ? (
                  <div className="rex-enquiry-reply">
                    <strong>{item.storeName} replied</strong>
                    <p>{item.reply}</p>
                    <small>{formatDate(item.repliedAt)}</small>
                  </div>
                ) : (
                  <p className="rex-order-note">
                    Waiting for the seller to reply.
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
