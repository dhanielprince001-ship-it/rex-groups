
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
import ThemeToggle from './ThemeToggle'
import { RatingSummary, Stars } from './StoreRatings'
import './market-filters.css'
import VerifiedBadge from './VerifiedBadge'

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
  ratingAverage?: number
  ratingCount?: number
  verified?: boolean
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
  ratingAverage?: number
  ratingCount?: number
  createdAt?: { seconds?: number }
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

const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-low', label: 'Price: low to high' },
  { value: 'price-high', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'name', label: 'Name: A to Z' },
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
  // Search and filters live in the web address, so a search can be shared or bookmarked.
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [category, setCategory] = useState(() => {
    const fromUrl = params.get('category')
    return fromUrl && CATEGORIES.includes(fromUrl) ? fromUrl : 'All categories'
  })
  const [priceMin, setPriceMin] = useState(params.get('min') ?? '')
  const [priceMax, setPriceMax] = useState(params.get('max') ?? '')
  const [minRating, setMinRating] = useState(params.get('rating') ?? '0')
  const [sort, setSort] = useState(() => {
    const fromUrl = params.get('sort')
    return SORTS.some((item) => item.value === fromUrl) ? (fromUrl as string) : 'featured'
  })
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
    // Every word typed must appear somewhere in the name, description, category or store.
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const min = priceMin.trim() === '' ? 0 : Number(priceMin)
    const max = priceMax.trim() === '' ? Infinity : Number(priceMax)
    const ratingFloor = Number(minRating) || 0

    const list = products.filter((product) => {
      const store = storeById.get(product.storeId)

      if (!store) return false

      if (category !== 'All categories' && product.category !== category) return false

      if (Number.isFinite(min) && product.price < min) return false
      if (Number.isFinite(max) && product.price > max) return false

      if (ratingFloor > 0 && !((product.ratingAverage ?? 0) >= ratingFloor)) return false

      if (terms.length === 0) return true

      const haystack = `${product.name || ''} ${product.description || ''} ${product.category || ''} ${store.name || ''}`.toLowerCase()

      return terms.every((term) => haystack.includes(term))
    })

    const sorted = [...list]

    if (sort === 'price-low') sorted.sort((a, b) => a.price - b.price)
    else if (sort === 'price-high') sorted.sort((a, b) => b.price - a.price)
    else if (sort === 'name') sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else if (sort === 'newest') sorted.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
    else if (sort === 'rating') {
      sorted.sort(
        (a, b) =>
          (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) ||
          (b.ratingCount ?? 0) - (a.ratingCount ?? 0),
      )
    }

    return sorted
  }, [products, search, category, priceMin, priceMax, minRating, sort, storeById])

  const filtersActive =
    search.trim() !== '' ||
    category !== 'All categories' ||
    priceMin !== '' ||
    priceMax !== '' ||
    minRating !== '0' ||
    sort !== 'featured'

  function clearFilters() {
    setSearch('')
    setCategory('All categories')
    setPriceMin('')
    setPriceMax('')
    setMinRating('0')
    setSort('featured')
  }

  // Keep the address bar in step with the filters (no new history entries).
  useEffect(() => {
    const next = new URLSearchParams()

    if (search.trim()) next.set('q', search.trim())
    if (category !== 'All categories') next.set('category', category)
    if (priceMin) next.set('min', priceMin)
    if (priceMax) next.set('max', priceMax)
    if (minRating !== '0') next.set('rating', minRating)
    if (sort !== 'featured') next.set('sort', sort)

    setParams(next, { replace: true })
  }, [search, category, priceMin, priceMax, minRating, sort, setParams])

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
        <ThemeToggle />
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

            <div className="rex-market-filters" aria-label="Product filters">
              <label>
                Min price (₦)
                <input
                  inputMode="numeric"
                  value={priceMin}
                  onChange={(event) => setPriceMin(event.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                />
              </label>

              <label>
                Max price (₦)
                <input
                  inputMode="numeric"
                  value={priceMax}
                  onChange={(event) => setPriceMax(event.target.value.replace(/\D/g, ''))}
                  placeholder="Any"
                />
              </label>

              <label>
                Rating
                <select value={minRating} onChange={(event) => setMinRating(event.target.value)}>
                  <option value="0">Any rating</option>
                  <option value="4">4 stars and up</option>
                  <option value="3">3 stars and up</option>
                </select>
              </label>

              <label>
                Sort by
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  {SORTS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>

              {filtersActive && (
                <button type="button" className="rex-market-clear" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
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

              {filtersActive && (
                <button type="button" className="rex-market-clear" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
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

                      {(product.ratingCount ?? 0) > 0 && (
                        <span className="rex-market-product-rating">
                          <Stars value={product.ratingAverage ?? 0} size={13} />
                          {(product.ratingAverage ?? 0).toFixed(1)} ({product.ratingCount})
                        </span>
                      )}

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

                    {store.verified === true && <VerifiedBadge />}

                    <RatingSummary
                      average={store.ratingAverage}
                      count={store.ratingCount}
                    />

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
