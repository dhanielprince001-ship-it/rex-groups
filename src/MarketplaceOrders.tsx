
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
}

type BuyerOrder = {
  id: string
  subtotal: number
  deliveryFee?: number | null
  status?: string
  paymentStatus?: string
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
  if (status === 'Partially Paid') return 'partial'

  return 'unpaid'
}

function Header({ right }: { right: ReactNode }) {
  return (
    <header className="rex-market-header">
      <Link className="rex-market-brand" to="/marketplace">
        <span className="rex-market-brand-mark">R<span>.</span></span>
        <span>REX <b>MARKETPLACE</b></span>
      </Link>

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

  const load = useCallback(async () => {
    if (!user) return

    setLoading(true)
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
        <Header right={<Link to="/marketplace">Back to marketplace</Link>} />

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
      <Header right={<Link to="/marketplace">Continue shopping</Link>} />

      <section className="rex-cart-content">
        <Link className="rex-cart-back" to="/marketplace">
          <ArrowLeft size={16} /> Back to marketplace
        </Link>

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
              <Link className="rex-market-primary-link" to="/marketplace">
                Explore products
              </Link>
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
                              className={`rex-pay-badge ${paymentClass(pack.paymentStatus)}`}
                            >
                              {pack.paymentStatus === 'Paid'
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

                          {pack.status === 'Delivered' && pack.sellerId && (
                            <Link
                              className="rex-package-rate"
                              to={`/marketplace/store/${pack.sellerId}#reviews`}
                            >
                              Rate this store
                            </Link>
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

                          {pack.paymentStatus !== 'Paid' && (
                            <p className="rex-order-note">
                              Waiting for secure payment confirmation. Your
                              order will move to fulfilment once payment is
                              verified. If you have completed payment, refresh
                              this page shortly.
                            </p>
                          )}

                          {pack.paymentStatus === 'Paid' &&
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
            <Link className="rex-market-primary-link" to="/marketplace">
              Browse stores
            </Link>
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
