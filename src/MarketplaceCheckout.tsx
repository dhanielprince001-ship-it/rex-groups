import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
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

    setLoading(true)
    setError('')

    try {
      const token = await user.getIdToken()

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

            <button
              className="rex-cart-checkout"
              type="submit"
              disabled={loading}
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

            <p>
              Delivery charges will be confirmed separately. No payment
              is collected in this checkout stage until Paystack is
              configured.
            </p>
          </aside>
        </div>
      </section>
    </main>
  )
}
