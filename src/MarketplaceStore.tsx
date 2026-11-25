
import { useEffect, useState } from 'react'
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
} from 'lucide-react'

import { db } from './firebase'
import { useCart } from './CartContext'

type StoreData = {
  id: string
  name: string
  description: string
  category: string
  logoUrl?: string
  coverUrl?: string
  location?: string
  status: string
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
          <Link to="/marketplace/cart">
            <ShoppingBag size={17} /> Cart
          </Link>
        </nav>
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
