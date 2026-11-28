
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore'
import { Check, MapPin, RefreshCw, ShoppingBag, Store } from 'lucide-react'

import { db } from './firebase'
import { useCart } from './CartContext'
import ThemeToggle from './ThemeToggle'
import VerifiedBadge from './VerifiedBadge'
import ProductReviews from './ProductReviews'
import { RatingSummary } from './StoreRatings'
import './product-page.css'

interface ProductData {
  id: string
  ownerId: string
  storeId: string
  name: string
  description: string
  price: number
  category: string
  imageUrl: string
  ratingAverage?: number
  ratingCount?: number
}

interface StoreData {
  id: string
  name: string
  location?: string
  verified?: boolean
  ratingAverage?: number
  ratingCount?: number
}

const money = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
})

function Header({ itemCount }: { itemCount: number }) {
  return (
    <header className="rex-market-header">
      <Link className="rex-market-brand" to="/marketplace">
        <span className="rex-market-brand-mark">R<span>.</span></span>
        <span>REX <b>MARKETPLACE</b></span>
      </Link>
      <Link to="/marketplace">Back to marketplace</Link>
      <Link to="/marketplace/cart">Cart ({itemCount})</Link>
      <ThemeToggle />
    </header>
  )
}

export default function MarketplaceProduct() {
  const { productId } = useParams()
  const { addItem, itemCount } = useCart()

  const [product, setProduct] = useState<ProductData | null>(null)
  const [store, setStore] = useState<StoreData | null>(null)
  const [related, setRelated] = useState<ProductData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [added, setAdded] = useState(false)

  useEffect(() => {
    let active = true

    async function load() {
      if (!db || !productId) {
        setError('This product could not be found.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')
      window.scrollTo(0, 0)

      try {
        const productSnap = await getDoc(doc(db, 'products', productId))
        const data = productSnap.data()

        if (!productSnap.exists() || !data || data.status !== 'Approved') {
          throw new Error('This product is not available.')
        }

        const item = { id: productSnap.id, ...data } as ProductData
        const storeSnap = await getDoc(doc(db, 'stores', item.storeId))

        if (!storeSnap.exists() || storeSnap.data()?.status !== 'Approved') {
          throw new Error('This product is not available.')
        }

        const more = await getDocs(
          query(
            collection(db, 'products'),
            where('storeId', '==', item.storeId),
            where('status', '==', 'Approved'),
            limit(9),
          ),
        )

        if (!active) return

        setProduct(item)
        setStore({ id: storeSnap.id, ...storeSnap.data() } as StoreData)
        setRelated(
          more.docs
            .map((d) => ({ id: d.id, ...d.data() }) as ProductData)
            .filter((p) => p.id !== item.id)
            .slice(0, 4),
        )
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'This product could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [productId])

  // Keep the header rating in step with new reviews.
  const onSummary = useCallback((average: number, count: number) => {
    setProduct((current) => (current ? { ...current, ratingAverage: average, ratingCount: count } : current))
  }, [])

  function handleAdd() {
    if (!product || !store) return

    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl || '',
      storeId: store.id,
      storeName: store.name,
    })

    setAdded(true)
    window.setTimeout(() => setAdded(false), 1800)
  }

  if (loading) {
    return (
      <main className="rex-marketplace rex-store-page">
        <Header itemCount={itemCount} />
        <div className="rex-store-state">
          <RefreshCw className="rex-market-spin" />
          <p>Loading product...</p>
        </div>
      </main>
    )
  }

  if (error || !product || !store) {
    return (
      <main className="rex-marketplace rex-store-page">
        <Header itemCount={itemCount} />
        <section className="rex-store-state">
          <ShoppingBag size={35} />
          <h1>Product unavailable.</h1>
          <p>{error || 'This product could not be found.'}</p>
          <Link className="rex-market-primary-link" to="/marketplace">Back to marketplace</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="rex-marketplace rex-store-page">
      <Header itemCount={itemCount} />

      <div className="rex-product-page">
        <nav className="rex-pp-crumbs" aria-label="Breadcrumb">
          <Link to="/marketplace">Marketplace</Link> / <span>{product.category}</span>
        </nav>

        <section className="rex-pp-main">
          <div className="rex-pp-image">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} />
            ) : (
              <ShoppingBag size={60} />
            )}
          </div>

          <div className="rex-pp-info">
            <span className="rex-pp-category">{product.category}</span>
            <h1>{product.name}</h1>

            <a href="#reviews" className="rex-pp-rating">
              <RatingSummary average={product.ratingAverage} count={product.ratingCount} />
            </a>

            <strong className="rex-pp-price">{money.format(product.price)}</strong>

            <p className="rex-pp-desc">{product.description}</p>

            <div className="rex-pp-actions">
              <button type="button" className={`rex-pp-add ${added ? 'is-added' : ''}`} onClick={handleAdd}>
                {added ? <><Check size={18} /> Added to cart</> : <><ShoppingBag size={18} /> Add to cart</>}
              </button>
              <Link className="rex-pp-link" to="/marketplace/cart">View cart</Link>
            </div>

            <Link className="rex-pp-store" to={`/marketplace/store/${store.id}`}>
              <Store size={18} aria-hidden="true" />
              <div>
                <strong>{store.name}</strong>
                <span>
                  <MapPin size={13} aria-hidden="true" /> {store.location || 'Nigeria'}
                  {store.verified === true && <VerifiedBadge />}
                </span>
                <RatingSummary average={store.ratingAverage} count={store.ratingCount} />
              </div>
            </Link>
          </div>
        </section>

        <ProductReviews productId={product.id} onSummary={onSummary} />

        {related.length > 0 && (
          <section className="rex-pp-related">
            <h2>More from {store.name}</h2>
            <div className="rex-pp-related-grid">
              {related.map((item) => (
                <Link key={item.id} to={`/marketplace/product/${item.id}`}>
                  <div className="rex-pp-related-img">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" /> : <ShoppingBag size={28} />}
                  </div>
                  <span>{item.name}</span>
                  <strong>{money.format(item.price)}</strong>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
