
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  ShoppingBag,
  Store,
  RefreshCw,
  Check,
} from 'lucide-react'

import { db } from './firebase'
import { useCart } from './CartContext'

type StoreItem = {
  id: string
  ownerId: string
  name: string
  description: string
  category: string
  logoUrl?: string
  coverUrl?: string
  location?: string
  status: string
}

type ProductItem = {
  id: string
  ownerId: string
  storeId: string
  name: string
  description: string
  price: number
  category: string
  imageUrl: string
  status: string
}

const CATEGORIES = [
  'All categories',
  'Fashion',
  'Electronics',
  'Phones & Accessories',
  'Beauty & Personal Care',
  'Food & Groceries',
  'Home & Furniture',
  'Health & Wellness',
  'Sports & Fitness',
  'Books & Education',
  'Other',
]

const money = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
})

export default function MarketplaceHome() {
  const [stores, setStores] = useState<StoreItem[]>([])
  const [products, setProducts] = useState<ProductItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All categories')
  const [addedProduct, setAddedProduct] = useState('')

  const { addItem, itemCount } = useCart()

  useEffect(() => {
    let active = true

    async function loadMarketplace() {
      if (!db) {
        setLoadError('The marketplace is temporarily unavailable.')
        setLoading(false)
        return
      }

      setLoading(true)
      setLoadError('')

      try {
        const [storeSnapshot, productSnapshot] = await Promise.all([
          getDocs(
            query(
              collection(db, 'stores'),
              where('status', '==', 'Approved'),
            ),
          ),
          getDocs(
            query(
              collection(db, 'products'),
              where('status', '==', 'Approved'),
            ),
          ),
        ])

        if (!active) return

        const storeItems = storeSnapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as StoreItem[]

        const productItems = productSnapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as ProductItem[]

        setStores(storeItems)
        setProducts(productItems)
      } catch (error) {
        console.error('Marketplace loading error:', error)

        if (active) {
          setLoadError(
            'We could not load marketplace listings. Please check the marketplace database permissions and try again.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadMarketplace()

    return () => {
      active = false
    }
  }, [])

  const storeById = useMemo(
    () => new Map(stores.map((store) => [store.id, store])),
    [stores],
  )

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase()

    return products.filter((product) => {
      const store = storeById.get(product.storeId)

      const matchesCategory =
        category === 'All categories' ||
        product.category === category

      const matchesSearch =
        !term ||
        (product.name || '').toLowerCase().includes(term) ||
        (product.description || '').toLowerCase().includes(term) ||
        (product.category || '').toLowerCase().includes(term) ||
        (store?.name || '').toLowerCase().includes(term)

      return matchesCategory && matchesSearch && Boolean(store)
    })
  }, [products, search, category, storeById])

  const filteredStores = useMemo(() => {
    const term = search.trim().toLowerCase()

    return stores.filter((store) => {
      const matchesCategory =
        category === 'All categories' ||
        store.category === category

      const matchesSearch =
        !term ||
        (store.name || '').toLowerCase().includes(term) ||
        (store.description || '').toLowerCase().includes(term) ||
        (store.category || '').toLowerCase().includes(term) ||
        (store.location || '').toLowerCase().includes(term)

      return matchesCategory && matchesSearch
    })
  }, [stores, search, category])

  function handleAddToCart(product: ProductItem, store: StoreItem) {
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl || '',
      storeId: product.storeId,
      storeName: store.name,
    })

    setAddedProduct(product.id)

    window.setTimeout(() => {
      setAddedProduct((current) =>
        current === product.id ? '' : current,
      )
    }, 1500)
  }

  return (
    <div className="rex-marketplace">
      <header className="rex-market-header">
        <Link
          className="rex-market-brand"
          to="/marketplace"
          aria-label="Rex Groups Marketplace home"
        >
          <span className="rex-market-brand-mark">
            R<span>.</span>
          </span>
          <span>REX <b>MARKETPLACE</b></span>
        </Link>

        <nav className="rex-market-nav" aria-label="Marketplace navigation">
          <a href="#market-products">Shop products</a>
          <a href="#market-stores">Explore stores</a>
          <Link to="/marketplace/orders">My orders</Link>
          <Link to="/">Rex Groups</Link>

          <Link
            className="rex-market-cart-link"
            to="/marketplace/cart"
            aria-label={`Shopping cart, ${itemCount} items`}
          >
            <ShoppingBag size={18} />
            <span>Cart</span>
            <b>{itemCount}</b>
          </Link>

          <Link
            className="rex-market-sell-link"
            to="/marketplace/seller"
          >
            Start selling <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>

      <main>
        <section className="rex-market-hero">
          <div className="rex-market-hero-inner">
            <span className="rex-market-eyebrow">
              A MARKETPLACE BY REX GROUPS
            </span>

            <h1>
              Discover something<br />
              <em>worth finding.</em>
            </h1>

            <p>
              Shop products from approved independent Nigerian businesses.
              Discover new stores, support local sellers and shop from wherever you are.
            </p>

            <div className="rex-market-search" role="search">
              <Search size={19} aria-hidden="true" />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products, stores or categories"
                aria-label="Search products, stores or categories"
              />

              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                aria-label="Filter by category"
              >
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="rex-market-hero-foot">
              <span><i /> Nigerian sellers</span>
              <span>Independent businesses</span>
              <span>Admin-reviewed listings</span>
            </div>
          </div>

          <div className="rex-market-hero-art" aria-hidden="true">
            <div className="market-art-card market-art-one">
              <ShoppingBag size={34} />
              <span>DISCOVER</span>
            </div>

            <div className="market-art-card market-art-two">
              <Store size={31} />
              <span>SHOP LOCAL</span>
            </div>

            <div className="market-art-orbit" />
            <b>RG.</b>
          </div>
        </section>

        <section className="rex-market-trust">
          <span>BUILT FOR BUYERS</span>
          <span>MADE FOR SELLERS</span>
          <span>GROWING WITH BUSINESSES</span>
        </section>

        <section className="rex-market-section" id="market-products">
          <div className="rex-market-section-heading">
            <div>
              <span className="rex-market-eyebrow">
                THE MARKETPLACE
              </span>

              <h2>
                Products to <em>explore.</em>
              </h2>

              <p>
                Discover products from stores approved by Rex Groups.
              </p>
            </div>

            <span className="rex-market-count">
              {filteredProducts.length} LISTINGS
            </span>
          </div>

          {loading ? (
            <div className="rex-market-state">
              <RefreshCw className="rex-market-spin" />
              Loading approved products and stores…
            </div>
          ) : loadError ? (
            <div className="rex-market-state rex-market-error">
              {loadError}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="rex-market-empty">
              <ShoppingBag size={28} />
              <h3>New discoveries are on the way.</h3>
              <p>
                There are no approved products matching this search yet.
                Try another category or check back soon.
              </p>
            </div>
          ) : (
            <div className="rex-market-product-grid">
              {filteredProducts.map((product) => {
                const store = storeById.get(product.storeId)

                if (!store) return null

                const isAdded = addedProduct === product.id

                return (
                  <article
                    className="rex-market-product-card"
                    key={product.id}
                  >
                    <Link
                      to={`/marketplace/product/${product.id}`}
                      className="rex-market-product-image"
                    >
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          loading="lazy"
                        />
                      ) : (
                        <ShoppingBag size={35} />
                      )}
                    </Link>

                    <div className="rex-market-product-info">
                      <span>{product.category}</span>

                      <h3>
                        <Link to={`/marketplace/product/${product.id}`}>
                          {product.name}
                        </Link>
                      </h3>

                      <p className="rex-market-product-store">
                        {store.name}
                      </p>

                      <strong>
                        {money.format(product.price)}
                      </strong>

                      <button
                        className={`rex-market-add-cart ${isAdded ? 'is-added' : ''}`}
                        type="button"
                        onClick={() => handleAddToCart(product, store)}
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

        <section
          className="rex-market-section rex-market-stores-section"
          id="market-stores"
        >
          <div className="rex-market-section-heading">
            <div>
              <span className="rex-market-eyebrow">
                SELLER COMMUNITY
              </span>

              <h2>
                Meet the <em>stores.</em>
              </h2>

              <p>
                Browse independent businesses that have passed store review.
              </p>
            </div>

            <Link
              className="rex-market-text-link"
              to="/marketplace/seller"
            >
              Open a store <ArrowRight size={17} />
            </Link>
          </div>

          {!loading && !loadError && filteredStores.length > 0 ? (
            <div className="rex-market-store-grid">
              {filteredStores.map((store) => (
                <article
                  className="rex-market-store-card"
                  key={store.id}
                >
                  <div className="rex-market-store-cover">
                    {store.coverUrl && (
                      <img
                        src={store.coverUrl}
                        alt=""
                        loading="lazy"
                      />
                    )}

                    <div className="rex-market-store-logo">
                      {store.logoUrl ? (
                        <img
                          src={store.logoUrl}
                          alt={`${store.name} logo`}
                          loading="lazy"
                        />
                      ) : (
                        <Store size={25} />
                      )}
                    </div>
                  </div>

                  <div className="rex-market-store-info">
                    <span>{store.category}</span>
                    <h3>{store.name}</h3>
                    <p>{store.description}</p>
                    <small>{store.location || 'Nigeria'}</small>

                    <Link to={`/marketplace/store/${store.id}`}>
                      Visit store <ArrowUpRight size={16} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : !loading && !loadError ? (
            <div className="rex-market-empty rex-market-empty-small">
              <Store size={25} />
              <p>
                Approved stores will appear here as sellers join the marketplace.
              </p>
            </div>
          ) : null}
        </section>

        <section className="rex-market-seller-cta">
          <div>
            <span className="rex-market-eyebrow">
              GROW YOUR BUSINESS
            </span>

            <h2>
              Have products to sell?<br />
              <em>Open your store.</em>
            </h2>

            <p>
              Apply to become a Rex Groups Marketplace seller.
              Every store is reviewed before it goes live.
            </p>
          </div>

          <Link to="/marketplace/seller">
            Become a seller <ArrowUpRight size={18} />
          </Link>
        </section>
      </main>

      <footer className="rex-market-footer">
        <Link className="rex-market-brand" to="/marketplace">
          <span className="rex-market-brand-mark">
            R<span>.</span>
          </span>
          <span>REX <b>MARKETPLACE</b></span>
        </Link>

        <span>
          © {new Date().getFullYear()} Rex Groups Marketplace
        </span>

        <Link to="/">
          Visit Rex Groups <ArrowUpRight size={15} />
        </Link>
      </footer>
    </div>
  )
}
