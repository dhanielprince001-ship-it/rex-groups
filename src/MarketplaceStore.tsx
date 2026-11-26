
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import {
  ArrowLeft,
  ArrowUpRight,
  ShoppingBag,
  Store,
  MapPin,
  RefreshCw,
  Check,
  Truck,
} from 'lucide-react'

import { db } from './firebase'
import { useAuth } from './AuthPanel'
import { useCart } from './CartContext'
import ThemeToggle from './ThemeToggle'
import StoreReviews, { RatingSummary } from './StoreRatings'
import VerifiedBadge from './VerifiedBadge'
import { readZones } from './delivery'

type StoreData = {
  id: string
  name: string
  description: string
  category: string
  logoUrl?: string
  coverUrl?: string
  location?: string
  status: string
  deliveryZones?: unknown
  ratingAverage?: number
  ratingCount?: number
  verified?: boolean
}

type ProductData = {
  id: string
  name: string
  description: string
  price: number
  category: string
  imageUrl: string
  storeId: string
  status: string
}

const money = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
})

function AskSeller({
  store,
  products,
}: {
  store: StoreData
  products: ProductData[]
}) {
  const { user, ready } = useAuth()

  const [productId, setProductId] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!user) return

    if (message.trim().length < 10) {
      setError('Please write at least 10 characters.')
      return
    }

    setSending(true)
    setError('')
    setSent(false)

    try {
      const token = await user.getIdToken()

      const response = await fetch('/api/seller-enquiries', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storeId: store.id,
          productId,
          message,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to send your enquiry.')
      }

      setMessage('')
      setProductId('')
      setSent(true)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to send your enquiry.',
      )
    } finally {
      setSending(false)
    }
  }

  // Sellers cannot enquire to their own store.
  if (!ready || user?.uid === store.id) return null

  return (
    <section className="rex-market-section rex-ask-seller" id="ask-seller">
      <div className="rex-market-section-heading">
        <div>
          <span className="rex-market-eyebrow">HAVE A QUESTION?</span>
          <h2>Ask <em>{store.name}.</em></h2>
          <p>Send a message to the seller. Their reply appears in My orders.</p>
        </div>
      </div>

      {!user ? (
        <Link
          className="rex-market-primary-link"
          to={`/?returnTo=${encodeURIComponent(`/marketplace/store/${store.id}`)}#account`}
        >
          Sign in to message this store
        </Link>
      ) : (
        <form className="rex-ask-form" onSubmit={handleSubmit}>
          <label htmlFor="ask-product">About a product (optional)</label>
          <select
            id="ask-product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={sending}
          >
            <option value="">General question</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>

          <label htmlFor="ask-message">Your message</label>
          <textarea
            id="ask-message"
            rows={4}
            maxLength={1000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about sizes, availability, delivery..."
            disabled={sending}
            required
          />

          {error && (
            <p className="rex-ask-error" role="alert">
              {error}
            </p>
          )}

          {sent && (
            <p className="rex-ask-success" role="status">
              Your enquiry was sent.{' '}
              <Link to="/marketplace/orders">See replies in My orders</Link>
            </p>
          )}

          <button
            className="rex-market-primary-link"
            type="submit"
            disabled={sending}
          >
            {sending ? 'Sending...' : 'Send enquiry'}
          </button>
        </form>
      )}
    </section>
  )
}

export default function MarketplaceStore() {
  const { storeId } = useParams()
  const { addItem } = useCart()

  const [store, setStore] = useState<StoreData | null>(null)
  const [products, setProducts] = useState<ProductData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addedProduct, setAddedProduct] = useState('')

  useEffect(() => {
    let active = true

    async function loadStore() {
      if (!db || !storeId) {
        setError('This store could not be found.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      try {
        const storeRef = doc(db, 'stores', storeId)
        const storeSnapshot = await getDoc(storeRef)

        if (!storeSnapshot.exists()) {
          if (active) {
            setError('This store does not exist.')
            setLoading(false)
          }
          return
        }

        const storeData = {
          id: storeSnapshot.id,
          ...storeSnapshot.data(),
        } as StoreData

        if (storeData.status !== 'Approved') {
          if (active) {
            setError('This store is not currently available.')
            setLoading(false)
          }
          return
        }

        const productQuery = query(
          collection(db, 'products'),
          where('storeId', '==', storeId),
          where('status', '==', 'Approved'),
        )

        const productSnapshot = await getDocs(productQuery)

        if (!active) return

        const productItems = productSnapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as ProductData[]

        setStore(storeData)
        setProducts(productItems)
      } catch (err) {
        console.error('Store loading error:', err)

        if (active) {
          setError(
            'We could not load this store. Please refresh and try again.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadStore()

    return () => {
      active = false
    }
  }, [storeId])

  const zones = readZones(store?.deliveryZones)

  function handleAddToCart(product: ProductData) {
    if (!store) return

    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl || '',
      storeId: store.id,
      storeName: store.name,
    })

    setAddedProduct(product.id)

    window.setTimeout(() => {
      setAddedProduct((current) =>
        current === product.id ? '' : current,
      )
    }, 1500)
  }

  if (loading) {
    return (
      <main className="rex-marketplace rex-store-page">
        <header className="rex-market-header">
          <Link className="rex-market-brand" to="/marketplace">
            <span className="rex-market-brand-mark">R<span>.</span></span>
            <span>REX <b>MARKETPLACE</b></span>
          </Link>
          <Link to="/marketplace">Back to marketplace</Link>
          <ThemeToggle />
        </header>

        <div className="rex-store-state">
          <RefreshCw className="rex-market-spin" />
          <p>Loading store...</p>
        </div>
      </main>
    )
  }

  if (error || !store) {
    return (
      <main className="rex-marketplace rex-store-page">
        <header className="rex-market-header">
          <Link className="rex-market-brand" to="/marketplace">
            <span className="rex-market-brand-mark">R<span>.</span></span>
            <span>REX <b>MARKETPLACE</b></span>
          </Link>
          <Link to="/marketplace">Back to marketplace</Link>
          <ThemeToggle />
        </header>

        <section className="rex-store-state">
          <Store size={35} />
          <h1>Store unavailable.</h1>
          <p>{error || 'This store could not be found.'}</p>
          <Link className="rex-market-primary-link" to="/marketplace">
            Explore marketplace
          </Link>
        </section>
      </main>
    )
  }

  return (
    <div className="rex-marketplace rex-store-page">
      <header className="rex-market-header">
        <Link className="rex-market-brand" to="/marketplace">
          <span className="rex-market-brand-mark">R<span>.</span></span>
          <span>REX <b>MARKETPLACE</b></span>
        </Link>

        <nav className="rex-market-nav">
          <Link to="/marketplace">Marketplace</Link>
          <Link to="/marketplace/orders">My orders</Link>
          <Link to="/marketplace/cart">
            <ShoppingBag size={17} /> Cart
          </Link>
        </nav>
        <ThemeToggle />
      </header>

      <main>
        <section className="rex-store-hero">
          <div className="rex-store-cover">
            {store.coverUrl ? (
              <img src={store.coverUrl} alt={`${store.name} cover`} />
            ) : (
              <div className="rex-store-cover-placeholder">
                <Store size={55} />
              </div>
            )}
          </div>

          <div className="rex-store-profile">
            <div className="rex-store-logo">
              {store.logoUrl ? (
                <img src={store.logoUrl} alt={`${store.name} logo`} />
              ) : (
                <Store size={35} />
              )}
            </div>

            <div className="rex-store-profile-info">
              <span className="rex-market-eyebrow">
                APPROVED REX MARKETPLACE STORE
              </span>

              <h1>{store.name}</h1>

              <p>{store.description || 'Welcome to our store.'}</p>

              <div className="rex-store-meta">
                <span>{store.category}</span>

                <span>
                  <MapPin size={15} />
                  {store.location || 'Nigeria'}
                </span>

                {store.verified === true && <VerifiedBadge />}

                <a href="#reviews" className="rex-store-rating-link">
                  <RatingSummary
                    average={store.ratingAverage}
                    count={store.ratingCount}
                  />
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="rex-market-section rex-store-products">
          <div className="rex-market-section-heading">
            <div>
              <span className="rex-market-eyebrow">SHOP THIS STORE</span>
              <h2>Explore our <em>products.</em></h2>
              <p>Browse products approved for sale in this store.</p>
            </div>

            <span className="rex-market-count">
              {products.length} PRODUCTS
            </span>
          </div>

          {products.length === 0 ? (
            <div className="rex-market-empty">
              <ShoppingBag size={30} />
              <h3>No products available yet.</h3>
              <p>This store has not published any approved products yet.</p>
            </div>
          ) : (
            <div className="rex-market-product-grid">
              {products.map((product) => {
                const isAdded = addedProduct === product.id

                return (
                  <article
                    className="rex-market-product-card"
                    key={product.id}
                  >
                    <div className="rex-market-product-image">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          loading="lazy"
                        />
                      ) : (
                        <ShoppingBag size={35} />
                      )}
                    </div>

                    <div className="rex-market-product-info">
                      <span>{product.category}</span>

                      <h3>{product.name}</h3>

                      <p className="rex-market-product-store">
                        {store.name}
                      </p>

                      <strong>{money.format(product.price)}</strong>

                      <button
                        className={`rex-market-add-cart ${isAdded ? 'is-added' : ''}`}
                        type="button"
                        onClick={() => handleAddToCart(product)}
                      >
                        {isAdded ? (
                          <>
                            <Check size={17} />
                            Added to cart
                          </>
                        ) : (
                          <>
                            <ShoppingBag size={17} />
                            Add to cart
                          </>
                        )}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="rex-market-section rex-store-delivery" id="delivery">
          <div className="rex-market-section-heading">
            <div>
              <span className="rex-market-eyebrow">DELIVERY</span>
              <h2>
                Delivery <em>prices.</em>
              </h2>
              <p>
                The price for your location is added to your order at
                checkout.
              </p>
            </div>

            <Truck size={26} aria-hidden="true" />
          </div>

          {zones.length === 0 ? (
            <p className="rex-reviews-note">
              This seller has not listed delivery prices yet. Ask them
              about delivery before you order.
            </p>
          ) : (
            <ul className="rex-delivery-list">
              {zones.map((zone) => (
                <li key={zone.id}>
                  <span>{zone.location}</span>
                  <strong>
                    {zone.fee > 0 ? money.format(zone.fee) : 'Free'}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <StoreReviews
          storeId={store.id}
          onChange={(average, count) =>
            setStore((current) =>
              current
                ? { ...current, ratingAverage: average, ratingCount: count }
                : current,
            )
          }
        />

        <AskSeller store={store} products={products} />

        <section className="rex-store-bottom-link">
          <Link to="/marketplace">
            <ArrowLeft size={17} />
            Back to all stores and products
          </Link>

          <Link to="/marketplace/seller">
            Open your own store
            <ArrowUpRight size={17} />
          </Link>
        </section>
      </main>

      <footer className="rex-market-footer">
        <Link className="rex-market-brand" to="/marketplace">
          <span className="rex-market-brand-mark">R<span>.</span></span>
          <span>REX <b>MARKETPLACE</b></span>
        </Link>

        <span>© {new Date().getFullYear()} Rex Groups Marketplace</span>

        <Link to="/">Visit Rex Groups</Link>
      </footer>
    </div>
  )
}
