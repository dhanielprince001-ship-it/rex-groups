import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShoppingBag,
  ShieldCheck,
} from 'lucide-react'

import { useAuth } from './AuthPanel'
import { useCart } from './CartContext'
import ThemeToggle from './ThemeToggle'
import { db } from './firebase'
import { readZones, suggestZone, type DeliveryZone } from './delivery'

const money = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
})

export default function MarketplaceCheckout() {
  const { user, ready } = useAuth()
  const { items, subtotal, clearCart } = useCart()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [country, setCountry] = useState('Nigeria')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [postalCode, setPostalCode] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [orderId, setOrderId] = useState('')
  const [paymentLoading, setPaymentLoading] = useState(false)
  const [paymentError, setPaymentError] = useState('')
  const [placedTotal, setPlacedTotal] = useState<number | null>(null)

  // Each store in the cart has its own delivery price list.
  const [zonesByStore, setZonesByStore] = useState<
    Record<string, DeliveryZone[]>
  >({})
  const [zonesLoading, setZonesLoading] = useState(true)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const pickedByHand = useRef<Set<string>>(new Set())

  const cartStores = useMemo(() => {
    const stores = new Map<string, string>()

    for (const item of items) {
      stores.set(item.storeId, item.storeName)
    }

    return Array.from(stores, ([id, name]) => ({ id, name }))
  }, [items])

  const storeKey = cartStores.map((store) => store.id).join('|')

  useEffect(() => {
    let active = true

    async function loadZones() {
      if (!db || !storeKey) {
        setZonesLoading(false)
        return
      }

      setZonesLoading(true)

      const database = db

      const entries = await Promise.all(
        storeKey.split('|').map(async (id) => {
          try {
            const snapshot = await getDoc(doc(database, 'stores', id))

            return [
              id,
              snapshot.exists() ? readZones(snapshot.data().deliveryZones) : [],
            ] as const
          } catch {
            return [id, [] as DeliveryZone[]] as const
          }
        }),
      )

      if (!active) return

      setZonesByStore(Object.fromEntries(entries))
      setZonesLoading(false)
    }

    void loadZones()

    return () => {
      active = false
    }
  }, [storeKey])

  // Pre-select the location that matches the delivery address.
  useEffect(() => {
    setChoices((current) => {
      const next = { ...current }

      for (const [storeId, zones] of Object.entries(zonesByStore)) {
        if (zones.length === 0 || pickedByHand.current.has(storeId)) continue

        next[storeId] = suggestZone(zones, city, state)
      }

      return next
    })
  }, [zonesByStore, city, state])

  const deliveryTotal = cartStores.reduce((sum, store) => {
    const zones = zonesByStore[store.id] || []
    const zone = zones.find((entry) => entry.id === choices[store.id])

    return sum + (zone ? zone.fee : 0)
  }, 0)

  useEffect(() => {
    if (user) {
      setFullName(user.displayName || '')
      setEmail(user.email || '')
    }
  }, [user])

  async function handleCheckout(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!user) {
      setError('Please sign in before placing your order.')
      return
    }

    if (!items.length) {
      setError('Your shopping cart is empty.')
      return
    }

    if (zonesLoading) {
      setError('Delivery prices are still loading. Please try again in a moment.')
      return
    }

    for (const store of cartStores) {
      const zones = zonesByStore[store.id] || []

      if (zones.length > 0 && !choices[store.id]) {
        setError(`Please choose a delivery location for ${store.name}.`)
        return
      }
    }

    setLoading(true)
    setError('')

    try {
      const token = await user.getIdToken()

      const deliveryChoices: Record<string, string> = {}

      for (const store of cartStores) {
        if ((zonesByStore[store.id] || []).length > 0) {
          deliveryChoices[store.id] = choices[store.id]
        }
      }

      const response = await fetch('/api/create-order', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          items: items.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
          deliveryChoices,
          shippingAddress: {
            fullName,
            phone,
            country,
            state,
            city,
            streetAddress,
            postalCode,
          },
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to create your order.',
        )
      }

      setOrderId(data.orderId)
      setPlacedTotal(typeof data.total === 'number' ? data.total : null)
      clearCart()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handlePayNow() {
    if (!user || !orderId) return

    setPaymentLoading(true)
    setPaymentError('')

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

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Payment could not be started.',
        )
      }

      if (
        typeof data.authorizationUrl !== 'string' ||
        !data.authorizationUrl.startsWith(
          'https://checkout.paystack.com/',
        )
      ) {
        throw new Error(
          'The payment provider returned an invalid checkout link.',
        )
      }

      window.location.assign(data.authorizationUrl)
    } catch (err) {
      setPaymentError(
        err instanceof Error
          ? err.message
          : 'Payment could not be started.',
      )
    } finally {
      setPaymentLoading(false)
    }
  }

  if (!ready) {
    return (
      <main className="rex-marketplace rex-checkout-page">
        <div className="rex-checkout-message">
          <Loader2 className="marketplace-spinner" size={28} />
          <p>Checking your account...</p>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="rex-marketplace rex-checkout-page">
        <header className="rex-market-header">
          <Link className="rex-market-brand" to="/marketplace">
            <span className="rex-market-brand-mark">R<span>.</span></span>
            <span>REX <b>MARKETPLACE</b></span>
          </Link>
          <Link to="/marketplace/cart">Back to cart</Link>
          <ThemeToggle />
        </header>

        <section className="rex-checkout-message">
          <ShoppingBag size={38} />
          <h1>Sign in to continue.</h1>
          <p>You need a Rex Groups account to complete checkout.</p>
          <Link
            className="rex-market-primary-link"
            to="/?returnTo=%2Fmarketplace%2Fcheckout#account"
          >
            Sign in or register
          </Link>
        </section>
      </main>
    )
  }

  if (orderId) {
    return (
      <main className="rex-marketplace rex-checkout-page">
        <header className="rex-market-header">
          <Link className="rex-market-brand" to="/marketplace">
            <span className="rex-market-brand-mark">R<span>.</span></span>
            <span>REX <b>MARKETPLACE</b></span>
          </Link>
          <ThemeToggle />
        </header>

        <section className="rex-checkout-message rex-checkout-success">
          <CheckCircle2 size={48} />
          <span className="rex-market-eyebrow">ORDER CREATED</span>
          <h1>Thank you for your order.</h1>
          <p>Your order has been recorded successfully.</p>
          <p>
            Order reference: <strong>{orderId}</strong>
          </p>
          {placedTotal !== null && (
            <p>
              Order total (products + delivery):{' '}
              <strong>{money.format(placedTotal)}</strong>
            </p>
          )}
          <p>
            Current status: <strong>Awaiting Payment</strong>
          </p>
          <p>
            Your order is saved. Online payment is currently being prepared
            and will become available once the administrator configures
            Paystack.
          </p>

          {paymentError && (
            <div className="marketplace-error" role="alert">
              {paymentError}
            </div>
          )}

          <button
            className="rex-market-primary-link"
            type="button"
            onClick={() => void handlePayNow()}
            disabled={paymentLoading}
          >
            {paymentLoading
              ? 'Connecting to payment...'
              : 'Pay securely with Paystack'}
          </button>

          <Link
            className="rex-market-primary-link"
            to="/marketplace/orders"
          >
            Track my order
          </Link>

          <Link className="rex-market-text-link" to="/marketplace">
            Continue shopping
          </Link>
        </section>
      </main>
    )
  }

  if (!items.length) {
    return (
      <main className="rex-marketplace rex-checkout-page">
        <header className="rex-market-header">
          <Link className="rex-market-brand" to="/marketplace">
            <span className="rex-market-brand-mark">R<span>.</span></span>
            <span>REX <b>MARKETPLACE</b></span>
          </Link>
          <ThemeToggle />
        </header>

        <section className="rex-checkout-message">
          <ShoppingBag size={38} />
          <h1>Your cart is empty.</h1>
          <Link className="rex-market-primary-link" to="/marketplace">
            Explore products
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="rex-marketplace rex-checkout-page">
      <header className="rex-market-header">
        <Link className="rex-market-brand" to="/marketplace">
          <span className="rex-market-brand-mark">R<span>.</span></span>
          <span>REX <b>MARKETPLACE</b></span>
        </Link>

        <Link to="/marketplace/cart">Back to cart</Link>
        <ThemeToggle />
      </header>

      <section className="rex-checkout-content">
        <Link className="rex-cart-back" to="/marketplace/cart">
          <ArrowLeft size={16} /> Return to cart
        </Link>

        <div className="rex-cart-heading">
          <div>
            <span className="rex-market-eyebrow">SECURE CHECKOUT</span>
            <h1>Delivery <em>details.</em></h1>
          </div>
        </div>

        {error && (
          <div className="marketplace-error" role="alert">
            {error}
          </div>
        )}

        <div className="rex-checkout-layout">
          <form
            className="rex-checkout-form"
            onSubmit={handleCheckout}
          >
            <h2>Customer information</h2>

            <label htmlFor="checkout-name">Full name</label>
            <input
              id="checkout-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              autoComplete="name"
              required
            />

            <label htmlFor="checkout-email">Email address</label>
            <input
              id="checkout-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <label htmlFor="checkout-phone">Phone number</label>
            <input
              id="checkout-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              required
            />

            <h2>Delivery address</h2>

            <label htmlFor="checkout-country">Country</label>
            <input
              id="checkout-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              autoComplete="country-name"
              required
            />

            <label htmlFor="checkout-state">State / Region</label>
            <input
              id="checkout-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              autoComplete="address-level1"
              required
            />

            <label htmlFor="checkout-city">City</label>
            <input
              id="checkout-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              autoComplete="address-level2"
              required
            />

            <label htmlFor="checkout-address">Street address</label>
            <textarea
              id="checkout-address"
              value={streetAddress}
              onChange={(e) => setStreetAddress(e.target.value)}
              rows={3}
              maxLength={300}
              autoComplete="street-address"
              required
            />

            <label htmlFor="checkout-postal">
              Postal code (optional)
            </label>
            <input
              id="checkout-postal"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              autoComplete="postal-code"
            />

            <h2>Delivery price</h2>

            {zonesLoading ? (
              <p className="rex-checkout-delivery-note">
                Loading delivery prices...
              </p>
            ) : (
              cartStores.map((store) => {
                const zones = zonesByStore[store.id] || []

                if (zones.length === 0) {
                  return (
                    <p
                      className="rex-checkout-delivery-note"
                      key={store.id}
                    >
                      <strong>{store.name}</strong> has not listed delivery
                      prices, so no delivery fee is added. Agree delivery
                      with the seller directly.
                    </p>
                  )
                }

                return (
                  <div key={store.id}>
                    <label htmlFor={`delivery-${store.id}`}>
                      Deliver {store.name} order to
                    </label>

                    <select
                      id={`delivery-${store.id}`}
                      value={choices[store.id] || ''}
                      onChange={(e) => {
                        pickedByHand.current.add(store.id)
                        setChoices((current) => ({
                          ...current,
                          [store.id]: e.target.value,
                        }))
                      }}
                      required
                    >
                      <option value="">Choose your location</option>

                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                          {zone.location} —{' '}
                          {zone.fee > 0 ? money.format(zone.fee) : 'Free'}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })
            )}

            <button
              className="rex-cart-checkout"
              type="submit"
              disabled={loading || zonesLoading}
            >
              {loading ? (
                <>
                  <Loader2
                    className="marketplace-spinner"
                    size={18}
                  />
                  Creating order...
                </>
              ) : (
                'Place order'
              )}
            </button>

            <p className="rex-checkout-security">
              <ShieldCheck size={17} />
              Your order details are verified by Rex Groups.
            </p>
          </form>

          <aside className="rex-cart-summary">
            <span className="rex-market-eyebrow">YOUR ORDER</span>
            <h2>Order summary</h2>

            {items.map((item) => (
              <div className="rex-checkout-item" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.storeName} · Qty {item.quantity}
                  </span>
                </div>
                <strong>
                  {money.format(item.price * item.quantity)}
                </strong>
              </div>
            ))}

            <div className="rex-cart-summary-total">
              <span>Product subtotal</span>
              <strong>{money.format(subtotal)}</strong>
            </div>

            {cartStores.map((store) => {
              const zones = zonesByStore[store.id] || []
              const zone = zones.find((entry) => entry.id === choices[store.id])

              if (zones.length === 0) return null

              return (
                <div className="rex-cart-summary-total" key={store.id}>
                  <span>
                    Delivery · {store.name}
                    {zone ? ` (${zone.location})` : ''}
                  </span>
                  <strong>
                    {zone
                      ? zone.fee > 0
                        ? money.format(zone.fee)
                        : 'Free'
                      : 'Choose location'}
                  </strong>
                </div>
              )
            })}

            <div className="rex-cart-summary-total rex-checkout-grand">
              <span>Total to pay</span>
              <strong>{money.format(subtotal + deliveryTotal)}</strong>
            </div>

            <p>
              The delivery price is set by each seller and goes to them
              in full. Payment is collected after you place the order.
            </p>
          </aside>
        </div>
      </section>
    </main>
  )
}
