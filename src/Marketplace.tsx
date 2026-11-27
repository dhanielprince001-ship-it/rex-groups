
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import DisputeThread from './DisputeThread'
import SellerEarnings from './SellerEarnings'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

import { db } from './firebase'
import { useAuth } from './AuthPanel'
import SellerInsights from './SellerInsights'
import SellerDelivery from './SellerDelivery'
import SellerVerification from './SellerVerification'
import { RatingSummary } from './StoreRatings'
import { readZones } from './delivery'

import {
  Store,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  Loader2,
  Package,
  Plus,
  Pencil,
  Trash2,
  X,
  ImagePlus,
  RefreshCw,
} from 'lucide-react'

type StoreStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Suspended'
  | 'Removed'

type StoreData = {
  ownerId: string
  name: string
  description: string
  category: string
  status: StoreStatus
  logoUrl?: string
  logoPublicId?: string
  coverUrl?: string
  coverPublicId?: string
  phone?: string
  whatsapp?: string
  email?: string
  location?: string
  socialLink?: string
  deliveryZones?: unknown
  ratingAverage?: number
  ratingCount?: number
}

type ProductStatus = 'Pending' | 'Approved' | 'Rejected' | 'Suspended'

type ProductData = {
  id: string
  ownerId: string
  storeId: string
  name: string
  description: string
  price: number
  category: string
  imageUrl: string
  publicId: string
  status: ProductStatus
  createdAt?: { seconds?: number }
}

type SellerOrder = {
  id: string
  orderId?: string
  sellerId: string
  customerId?: string
  customerName?: string
  customerEmail?: string
  storeName?: string
  items: {
    productId: string
    name: string
    unitPrice?: number
    price?: number
    lineTotal?: number
    quantity: number
    imageUrl?: string
  }[]
  subtotal: number
  deliveryFee?: number
  deliveryLocation?: string
  payoutStatus?: string
  payoutReference?: string
  autoReleaseAt?: { seconds?: number } | null
  disputeReason?: string
  commissionAmount: number
  sellerNetAmount: number
  paymentStatus: string
  status: string
  trackingNumber?: string
  shippingCarrier?: string
  createdAt?: { seconds?: number }
}

type UploadPurpose = 'product' | 'store'

type UploadSignature = {
  timestamp: number
  signature: string
  folder: string
  cloudName: string
  apiKey: string
  uploadPreset: string
  error?: string
}

type CloudinaryResult = {
  secure_url: string
  public_id: string
}

const categories = [
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

const allowedImageTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
]

function validateImage(file: File): string | null {
  if (!allowedImageTypes.includes(file.type)) {
    return 'Choose a JPG, PNG or WEBP image.'
  }

  if (file.size > 5 * 1024 * 1024) {
    return 'Image must be 5MB or smaller.'
  }

  return null
}

async function uploadImage(
  file: File,
  idToken: string,
  purpose: UploadPurpose = 'product'
): Promise<CloudinaryResult> {
  const signatureResponse = await fetch('/api/cloudinary-signature', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ purpose }),
  })

  const signatureData = (await signatureResponse
    .json()
    .catch(() => ({}))) as UploadSignature

  if (!signatureResponse.ok) {
    throw new Error(
      signatureData.error || 'Unable to prepare image upload.'
    )
  }

  const formData = new FormData()

  formData.append('file', file)
  formData.append('api_key', signatureData.apiKey)
  formData.append('timestamp', String(signatureData.timestamp))
  formData.append('signature', signatureData.signature)
  formData.append('upload_preset', signatureData.uploadPreset)
  formData.append('folder', signatureData.folder)

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  )

  const uploadData = (await uploadResponse
    .json()
    .catch(() => ({}))) as CloudinaryResult & {
    error?: { message?: string }
  }

  if (!uploadResponse.ok) {
    throw new Error(
      uploadData.error?.message || 'Image upload failed.'
    )
  }

  return uploadData
}

const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
})

function formatOrderDate(seconds?: number) {
  if (!seconds) return 'Date unavailable'

  return new Date(seconds * 1000).toLocaleString()
}

export default function Marketplace() {
  const { user, ready } = useAuth()
  const database = db

  // STORE STATE
  const [store, setStore] = useState<StoreData | null>(null)
  const [loadingStore, setLoadingStore] = useState(true)

  const [storeName, setStoreName] = useState('')
  const [storeDescription, setStoreDescription] = useState('')
  const [storeCategory, setStoreCategory] = useState('Fashion')

  const [storePhone, setStorePhone] = useState('')
  const [storeWhatsapp, setStoreWhatsapp] = useState('')
  const [storeEmail, setStoreEmail] = useState('')
  const [storeLocation, setStoreLocation] = useState('')
  const [storeSocialLink, setStoreSocialLink] = useState('')

  const [storeLogo, setStoreLogo] = useState<File | null>(null)
  const [storeCover, setStoreCover] = useState<File | null>(null)

  const [savingStore, setSavingStore] = useState(false)

  // PRODUCT STATE
  const [products, setProducts] = useState<ProductData[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)

  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)

  const [productName, setProductName] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productCategory, setProductCategory] = useState('Fashion')
  const [productImage, setProductImage] = useState<File | null>(null)

  const [savingProduct, setSavingProduct] = useState(false)

  // SELLER ORDERS STATE
  const [sellerOrders, setSellerOrders] = useState<SellerOrder[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [updatingOrder, setUpdatingOrder] = useState<string | null>(null)

  const [trackingInputs, setTrackingInputs] = useState<
    Record<string, string>
  >({})

  const [carrierInputs, setCarrierInputs] = useState<
    Record<string, string>
  >({})

  // MESSAGES
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const storeLocked =
    store?.status === 'Rejected' ||
    store?.status === 'Suspended' ||
    store?.status === 'Removed'

  const uid = user?.uid
  const hasStore = store !== null

  const [orderNotice, setOrderNotice] = useState<{ id: string; ok: boolean; text: string } | null>(null)

  const formSyncedRef = useRef(false)
  const feedbackRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (message || error) {
      feedbackRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [message, error])

  // LOAD STORE
  useEffect(() => {
    if (!ready) return

    if (!user || !database) {
      setStore(null)
      setLoadingStore(false)
      return
    }

    setLoadingStore(true)

    const storeRef = doc(database, 'stores', user.uid)

    const unsubscribe = onSnapshot(
      storeRef,
      (snapshot) => {
        const firstSnapshot = !formSyncedRef.current

        if (snapshot.exists()) {
          const data = snapshot.data() as StoreData

          setStore(data)

          if (firstSnapshot) {
            setStoreName(data.name || '')
            setStoreDescription(data.description || '')
            setStoreCategory(data.category || 'Other')

            setStorePhone(data.phone || '')
            setStoreWhatsapp(data.whatsapp || '')
            setStoreEmail(data.email || user.email || '')
            setStoreLocation(data.location || '')
            setStoreSocialLink(data.socialLink || '')
          }
        } else {
          setStore(null)

          if (firstSnapshot) {
            setStoreEmail(user.email || '')
          }
        }

        formSyncedRef.current = true
        setLoadingStore(false)
      },
      (err) => {
        console.error('Store loading error:', err)
        setError('Unable to load your store. Please try again.')
        setLoadingStore(false)
      }
    )

    return () => {
      formSyncedRef.current = false
      unsubscribe()
    }
  }, [user, ready, database])

  // LOAD SELLER PRODUCTS
  useEffect(() => {
    if (!ready) return

    if (!uid || !database || !hasStore) {
      setProducts([])
      setLoadingProducts(false)
      return
    }

    setLoadingProducts(true)

    const productsQuery = query(
      collection(database, 'products'),
      where('ownerId', '==', uid)
    )

    const unsubscribe = onSnapshot(
      productsQuery,
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as ProductData[]

        items.sort(
          (a, b) =>
            (b.createdAt?.seconds || 0) -
            (a.createdAt?.seconds || 0)
        )

        setProducts(items)
        setLoadingProducts(false)
      },
      (err) => {
        console.error('Product loading error:', err)
        setError('Unable to load your products.')
        setLoadingProducts(false)
      }
    )

    return () => unsubscribe()
  }, [uid, ready, hasStore, database])

  // LOAD SELLER ORDERS
  async function loadSellerOrders(silent = false) {
    if (!user || store?.status !== 'Approved') {
      setSellerOrders([])
      return
    }

    // A silent reload keeps the list on screen so the page does not jump.
    if (!silent) setLoadingOrders(true)

    try {
      const token = await user.getIdToken()

      const response = await fetch('/api/seller-orders', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to load orders.')
      }

      setSellerOrders(
        Array.isArray(data.orders) ? data.orders : []
      )
    } catch (err) {
      console.error('Seller orders loading error:', err)

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load your orders.'
      )
    } finally {
      setLoadingOrders(false)
    }
  }

  // AUTOMATICALLY LOAD ORDERS WHEN STORE IS APPROVED
  useEffect(() => {
    if (store?.status === 'Approved' && user) {
      void loadSellerOrders()
    } else {
      setSellerOrders([])
    }
  }, [user, store?.status])

  // UPDATE SELLER ORDER
  async function updateSellerOrder(
    order: SellerOrder,
    status: 'Processing' | 'Shipped' | 'Delivered'
  ) {
    if (!user) {
      setOrderNotice({ id: order.id, ok: false, text: 'Please sign in again.' })
      return
    }

    if (order.paymentStatus !== 'Paid') {
      setOrderNotice({ id: order.id, ok: false, text: 'This order cannot be updated until payment is confirmed.' })
      return
    }

    const trackingNumber = trackingInputs[order.id] || ''
    const shippingCarrier = carrierInputs[order.id] || ''

    if (status === 'Shipped' && !trackingNumber.trim()) {
      setOrderNotice({ id: order.id, ok: false, text: 'Enter a tracking number before shipping this order.' })
      return
    }

    setUpdatingOrder(order.id)
    setOrderNotice(null)

    try {
      const token = await user.getIdToken()

      const response = await fetch('/api/seller-orders', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sellerOrderId: order.id,
          status,
          trackingNumber,
          shippingCarrier,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to update this order.')
      }

      setOrderNotice({ id: order.id, ok: true, text: data.message || 'Order updated successfully.' })

      await loadSellerOrders(true)
    } catch (err) {
      console.error('Order update error:', err)

      setOrderNotice({
        id: order.id,
        ok: false,
        text:
          err instanceof Error
            ? err.message
            : 'Unable to update this order.',
      })
    } finally {
      setUpdatingOrder(null)
    }
  }

  // RESET PRODUCT FORM
  function resetProductForm() {
    setEditingProductId(null)
    setProductName('')
    setProductDescription('')
    setProductPrice('')
    setProductCategory('Fashion')
    setProductImage(null)
    setShowProductForm(false)
  }

  // CREATE OR UPDATE STORE
  async function handleStoreSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!user || !database) {
      setError('Please sign in first.')
      return
    }

    if (storeLocked) {
      setError('This store cannot currently be edited.')
      return
    }

    if (storeName.trim().length < 3) {
      setError('Store name must contain at least 3 characters.')
      return
    }

    if (storeDescription.trim().length < 20) {
      setError('Store description must contain at least 20 characters.')
      return
    }

    if (!storePhone.trim()) {
      setError('Please enter your business phone number.')
      return
    }

    if (!storeWhatsapp.trim()) {
      setError('Please enter your WhatsApp number.')
      return
    }

    if (!storeEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(storeEmail)) {
      setError('Please enter a valid business email.')
      return
    }

    if (!storeLocation.trim()) {
      setError('Please enter your business location.')
      return
    }

    if (
      !storeSocialLink.trim() ||
      !/^https?:\/\/.+/i.test(storeSocialLink.trim())
    ) {
      setError('Enter a valid social media link beginning with https://')
      return
    }

    if (!store?.logoUrl && !storeLogo) {
      setError('Please upload your store logo.')
      return
    }

    if (!store?.coverUrl && !storeCover) {
      setError('Please upload your store cover image.')
      return
    }

    if (storeLogo) {
      const imageError = validateImage(storeLogo)
      if (imageError) {
        setError(`Store logo: ${imageError}`)
        return
      }
    }

    if (storeCover) {
      const imageError = validateImage(storeCover)
      if (imageError) {
        setError(`Store cover: ${imageError}`)
        return
      }
    }

    setSavingStore(true)
    setError('')
    setMessage('')

    try {
      const token = await user.getIdToken()

      let logoUrl = store?.logoUrl || ''
      let logoPublicId = store?.logoPublicId || ''
      let coverUrl = store?.coverUrl || ''
      let coverPublicId = store?.coverPublicId || ''

      if (storeLogo) {
        const uploadedLogo = await uploadImage(
          storeLogo,
          token,
          'store'
        )

        logoUrl = uploadedLogo.secure_url
        logoPublicId = uploadedLogo.public_id
      }

      if (storeCover) {
        const uploadedCover = await uploadImage(
          storeCover,
          token,
          'store'
        )

        coverUrl = uploadedCover.secure_url
        coverPublicId = uploadedCover.public_id
      }

      const storeData = {
        ownerId: user.uid,
        ownerName: user.displayName || user.email || 'Store Owner',
        name: storeName.trim(),
        description: storeDescription.trim(),
        category: storeCategory,
        logoUrl,
        logoPublicId,
        coverUrl,
        coverPublicId,
        phone: storePhone.trim(),
        whatsapp: storeWhatsapp.trim(),
        email: storeEmail.trim(),
        location: storeLocation.trim(),
        socialLink: storeSocialLink.trim(),
        updatedAt: serverTimestamp(),
      }

      const storeRef = doc(database, 'stores', user.uid)

      if (store) {
        // ownerName is only set when the store is first created.
        const updateData: Partial<typeof storeData> = { ...storeData }
        delete updateData.ownerName

        await updateDoc(storeRef, updateData)
        setMessage('Store details updated successfully.')
      } else {
        await setDoc(storeRef, {
          ...storeData,
          status: 'Pending',
          createdAt: serverTimestamp(),
        })

        setMessage('Store application submitted. Awaiting approval.')
      }

      setStoreLogo(null)
      setStoreCover(null)
    } catch (err) {
      console.error('Store submission error:', err)

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save your store. Please try again.'
      )
    } finally {
      setSavingStore(false)
    }
  }

  // CREATE OR UPDATE PRODUCT
  async function handleProductSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!user || !database) {
      setError('Please sign in first.')
      return
    }

    if (store?.status !== 'Approved') {
      setError('You need an approved store before adding products.')
      return
    }

    const price = Number(productPrice)

    if (!productName.trim() || productName.trim().length < 3) {
      setError('Product name must contain at least 3 characters.')
      return
    }

    if (
      productDescription.trim().length < 20 ||
      productDescription.trim().length > 2000
    ) {
      setError('Product description must contain 20 to 2000 characters.')
      return
    }

    if (!Number.isFinite(price) || price <= 0) {
      setError('Enter a valid product price.')
      return
    }

    if (!editingProductId && !productImage) {
      setError('Please select a product image.')
      return
    }

    if (productImage) {
      const imageError = validateImage(productImage)

      if (imageError) {
        setError(imageError)
        return
      }
    }

    setSavingProduct(true)
    setError('')
    setMessage('')

    try {
      let imageUrl = ''
      let publicId = ''

      const existingProduct = products.find(
        (item) => item.id === editingProductId
      )

      if (editingProductId && !existingProduct) {
        throw new Error(
          'This product could not be found. Refresh the page and try again.'
        )
      }

      if (productImage) {
        const token = await user.getIdToken()

        const uploadedImage = await uploadImage(
          productImage,
          token,
          'product'
        )

        imageUrl = uploadedImage.secure_url
        publicId = uploadedImage.public_id
      } else if (existingProduct) {
        imageUrl = existingProduct.imageUrl
        publicId = existingProduct.publicId
      }

      const productData = {
        ownerId: user.uid,
        storeId: user.uid,
        name: productName.trim(),
        description: productDescription.trim(),
        price,
        category: productCategory,
        imageUrl,
        publicId,
        status: 'Approved' as ProductStatus,
        updatedAt: serverTimestamp(),
      }

      if (editingProductId) {
        await updateDoc(
          doc(database, 'products', editingProductId),
          productData
        )

        setMessage('Product updated and published successfully.')
      } else {
        await addDoc(collection(database, 'products'), {
          ...productData,
          createdAt: serverTimestamp(),
        })

        setMessage(
          'Product published successfully. It is now live in your store.'
        )
      }

      resetProductForm()
    } catch (err) {
      console.error('Product submission error:', err)

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save product. Please try again.'
      )
    } finally {
      setSavingProduct(false)
    }
  }

  // EDIT PRODUCT
  function handleEditProduct(product: ProductData) {
    setEditingProductId(product.id)
    setProductName(product.name)
    setProductDescription(product.description)
    setProductPrice(String(product.price))
    setProductCategory(product.category)
    setProductImage(null)
    setShowProductForm(true)
    setError('')
    setMessage('')
  }

  // DELETE PRODUCT
  async function handleDeleteProduct(product: ProductData) {
    if (!user || !database) return

    const confirmed = window.confirm(
      `Delete "${product.name}" from your store?`
    )

    if (!confirmed) return

    setError('')
    setMessage('')

    try {
      await deleteDoc(doc(database, 'products', product.id))
      setMessage('Product deleted successfully.')
    } catch (err) {
      console.error('Product deletion error:', err)
      setError('Unable to delete this product.')
    }
  }

  // LOADING
  if (!ready || loadingStore) {
    return (
      <section className="marketplace-section" id="marketplace">
        <div className="marketplace-loading">
          <Loader2 className="marketplace-spinner" size={26} />
          <p>Loading your store...</p>
        </div>
      </section>
    )
  }

  // SIGN IN REQUIRED
  if (!user) {
    return (
      <section className="marketplace-section" id="marketplace">
        <div className="marketplace-card">
          <Store size={36} />
          <h2>Start Your Online Store</h2>
          <p>
            Sign in to your Rex Groups account before applying
            to become a marketplace seller.
          </p>
          <Link
            to="/?returnTo=%2Fmarketplace%2Fseller#account"
            className="marketplace-button"
          >
            Sign In or Register
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="marketplace-section" id="marketplace">
      <div className="marketplace-heading">
        <span className="marketplace-eyebrow">
          REX GROUPS MARKETPLACE
        </span>

        <h1>
          {store ? 'Manage Your Store' : 'Create Your Online Store'}
        </h1>

        <p>
          Build your online business and reach customers
          through the Rex Groups marketplace.
        </p>
      </div>

      {/* STORE STATUS */}
      {store && (
        <div className={`marketplace-status ${store.status.toLowerCase()}`}>
          {store.status === 'Approved' ? (
            <CheckCircle2 size={22} />
          ) : store.status === 'Pending' ? (
            <Clock size={22} />
          ) : (
            <AlertCircle size={22} />
          )}

          <div>
            <strong>Store status: {store.status}</strong>

            <p>
              {store.status === 'Pending' &&
                'Your application is waiting for admin approval.'}

              {store.status === 'Approved' &&
                'Your store is approved. You can now manage products and orders.'}

              {store.status === 'Rejected' &&
                'Your application was rejected. Contact Rex Groups for assistance.'}

              {store.status === 'Suspended' &&
                'Your store is suspended. Contact Rex Groups.'}

              {store.status === 'Removed' &&
                'Your store has been removed from the marketplace. Contact Rex Groups if you think this is a mistake.'}
            </p>
          </div>
        </div>
      )}

      {/* FEEDBACK */}
      <div ref={feedbackRef}>
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
      </div>

      {/* STORE FORM */}
      <form
        className="marketplace-form"
        onSubmit={handleStoreSubmit}
      >
        <div className="marketplace-form-heading">
          <Store size={24} />

          <div>
            <h3>
              {store ? 'Store Information' : 'Store Application'}
            </h3>

            <p>
              Add your store branding and business contact information.
            </p>
          </div>
        </div>

        <label htmlFor="store-name">Store Name</label>

        <input
          id="store-name"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          maxLength={80}
          required
          disabled={savingStore || storeLocked}
        />

        <label htmlFor="store-category">Business Category</label>

        <select
          id="store-category"
          value={storeCategory}
          onChange={(e) => setStoreCategory(e.target.value)}
          disabled={savingStore || storeLocked}
        >
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <label htmlFor="store-description">Store Description</label>

        <textarea
          id="store-description"
          value={storeDescription}
          onChange={(e) => setStoreDescription(e.target.value)}
          rows={5}
          maxLength={1000}
          required
          disabled={savingStore || storeLocked}
        />

        <div className="store-image-fields">
          <div className="store-image-field">
            <label htmlFor="store-logo">Store Logo</label>

            {store?.logoUrl && !storeLogo && (
              <img
                className="store-image-preview store-logo-preview"
                src={store.logoUrl}
                alt="Current store logo"
              />
            )}

            <div className="product-image-upload">
              <ImagePlus size={24} />

              <input
                id="store-logo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) =>
                  setStoreLogo(e.target.files?.[0] || null)
                }
                disabled={savingStore || storeLocked}
              />

              <p>Square logo recommended. JPG, PNG or WEBP, maximum 5MB.</p>

              {storeLogo && <strong>{storeLogo.name}</strong>}
            </div>
          </div>

          <div className="store-image-field">
            <label htmlFor="store-cover">Store Cover / Banner</label>

            {store?.coverUrl && !storeCover && (
              <img
                className="store-image-preview store-cover-preview"
                src={store.coverUrl}
                alt="Current store cover"
              />
            )}

            <div className="product-image-upload">
              <ImagePlus size={24} />

              <input
                id="store-cover"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) =>
                  setStoreCover(e.target.files?.[0] || null)
                }
                disabled={savingStore || storeLocked}
              />

              <p>Wide banner recommended. JPG, PNG or WEBP, maximum 5MB.</p>

              {storeCover && <strong>{storeCover.name}</strong>}
            </div>
          </div>
        </div>

        <div className="store-contact-fields">
          <h4>Business Contact Information</h4>

          <label htmlFor="store-phone">Business Phone Number</label>

          <input
            id="store-phone"
            type="tel"
            value={storePhone}
            onChange={(e) => setStorePhone(e.target.value)}
            placeholder="+234..."
            required
            disabled={savingStore || storeLocked}
          />

          <label htmlFor="store-whatsapp">WhatsApp Number</label>

          <input
            id="store-whatsapp"
            type="tel"
            value={storeWhatsapp}
            onChange={(e) => setStoreWhatsapp(e.target.value)}
            placeholder="+234..."
            required
            disabled={savingStore || storeLocked}
          />

          <label htmlFor="store-email">Business Email</label>

          <input
            id="store-email"
            type="email"
            value={storeEmail}
            onChange={(e) => setStoreEmail(e.target.value)}
            placeholder="business@example.com"
            required
            disabled={savingStore || storeLocked}
          />

          <label htmlFor="store-location">Business Location</label>

          <input
            id="store-location"
            value={storeLocation}
            onChange={(e) => setStoreLocation(e.target.value)}
            placeholder="City, State, Country"
            required
            disabled={savingStore || storeLocked}
          />

          <label htmlFor="store-social">Instagram or Social Media Link</label>

          <input
            id="store-social"
            type="url"
            value={storeSocialLink}
            onChange={(e) => setStoreSocialLink(e.target.value)}
            placeholder="https://instagram.com/yourstore"
            required
            disabled={savingStore || storeLocked}
          />
        </div>

        {!storeLocked && (
          <button
            type="submit"
            className="marketplace-button"
            disabled={savingStore}
          >
            {savingStore ? (
              <>
                <Loader2 className="marketplace-spinner" size={18} />
                Saving store...
              </>
            ) : (
              <>
                <Send size={18} />
                {store ? 'Save Store Changes' : 'Submit Store Application'}
              </>
            )}
          </button>
        )}
      </form>

      {/* APPROVED SELLER DASHBOARD */}
      {store?.status === 'Approved' && (
        <div className="seller-products">

          {/* SALES & ENQUIRIES */}
          <SellerInsights
            orders={sellerOrders}
            loadingOrders={loadingOrders}
          />

          {/* IDENTITY CHECK */}
          <SellerVerification />

          {/* STORE RATING */}
          <div className="seller-rating-line">
            <span>Your store rating</span>
            <RatingSummary
              average={store.ratingAverage}
              count={store.ratingCount}
            />
          </div>

          {/* DELIVERY PRICES */}
          <SellerDelivery zones={readZones(store.deliveryZones)} />

          {sellerOrders.length > 0 && <SellerEarnings orders={sellerOrders} />}

          {/* MY ORDERS */}
          <div className="seller-orders-section">
            <div className="seller-orders-heading">
              <div>
                <span className="marketplace-eyebrow">
                  SELLER DASHBOARD
                </span>

                <h3>My Orders</h3>

                <p>
                  View customer purchases and manage order fulfilment.
                </p>
              </div>

              <button
                type="button"
                className="marketplace-button"
                onClick={() => void loadSellerOrders()}
                disabled={loadingOrders}
              >
                {loadingOrders ? (
                  <Loader2 className="marketplace-spinner" size={18} />
                ) : (
                  <RefreshCw size={18} />
                )}
                Refresh
              </button>
            </div>

            {loadingOrders && sellerOrders.length === 0 ? (
              <div className="marketplace-loading">
                <Loader2 className="marketplace-spinner" size={24} />
                <p>Loading your orders...</p>
              </div>
            ) : sellerOrders.length === 0 ? (
              <div className="seller-empty-products">
                <Package size={38} />
                <h4>No orders yet</h4>
                <p>
                  Customer purchases from your store will appear here.
                </p>
              </div>
            ) : (
              <div className="seller-orders-list">
                {sellerOrders.map((order) => (
                  <article className="seller-order-card" key={order.id}>
                    <div className="seller-order-top">
                      <div>
                        <span className="marketplace-eyebrow">
                          ORDER REFERENCE
                        </span>

                        <h4>{order.id}</h4>

                        <p>
                          {formatOrderDate(order.createdAt?.seconds)}
                        </p>
                      </div>

                      <span
                        className={`product-status ${
                          order.paymentStatus === 'Paid'
                            ? 'approved'
                            : 'pending'
                        }`}
                      >
                        {order.paymentStatus || 'Unpaid'}
                      </span>
                    </div>

                    <div className="seller-order-customer">
                      <strong>Customer information</strong>

                      <p>{order.customerName || 'Customer'}</p>
                      <p>{order.customerEmail || 'Email unavailable'}</p>
                    </div>

                    <div className="seller-order-items">
                      <strong>Products ordered</strong>

                      {order.items?.map((item, index) => (
                        <div
                          className="seller-order-item"
                          key={`${item.productId}-${index}`}
                        >
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                            />
                          )}

                          <div>
                            <strong>{item.name}</strong>
                            <p>Quantity: {item.quantity}</p>
                            <p>
                              {naira.format(
                                item.unitPrice ?? item.price ?? 0
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="seller-order-financials">
                      <div>
                        <span>Order subtotal</span>
                        <strong>
                          {naira.format(order.subtotal || 0)}
                        </strong>
                      </div>

                      {(order.deliveryFee ?? 0) > 0 && (
                        <div>
                          <span>
                            Delivery
                            {order.deliveryLocation
                              ? ` to ${order.deliveryLocation}`
                              : ''}{' '}
                            (paid to you in full)
                          </span>
                          <strong>
                            {naira.format(order.deliveryFee || 0)}
                          </strong>
                        </div>
                      )}

                      <div>
                        <span>Rex Groups commission (products only)</span>
                        <strong>
                          {naira.format(order.commissionAmount || 0)}
                        </strong>
                      </div>

                      <div>
                        <span>Your earnings before other fees</span>
                        <strong>
                          {naira.format(order.sellerNetAmount || 0)}
                        </strong>
                      </div>
                    </div>

                    {order.paymentStatus === 'Paid' && (
                      <div className="seller-payout">
                        <strong>Your payout</strong>

                        <span>
                          {(() => {
                            const payout = order.payoutStatus || 'Held'

                            if (payout === 'Held') {
                              return order.autoReleaseAt?.seconds
                                ? `Held until the buyer confirms delivery. Released automatically on ${new Date(order.autoReleaseAt.seconds * 1000).toLocaleDateString()} unless the buyer reports a problem.`
                                : 'Held by Rex Groups until the buyer confirms delivery.'
                            }

                            if (payout === 'Released') {
                              return 'Released. Rex Groups will pay this out to you.'
                            }

                            if (payout === 'Paid Out') {
                              return `Paid out to you${order.payoutReference ? ` (ref: ${order.payoutReference})` : ''}.`
                            }

                            if (payout === 'Disputed') {
                              return 'On hold: the buyer reported a problem. Rex Groups will contact you.'
                            }

                            if (payout === 'Cancelled') {
                              return 'Cancelled: the buyer was refunded.'
                            }

                            return payout
                          })()}
                        </span>

                        {order.payoutStatus === 'Disputed' && (
                          <DisputeThread
                            user={user}
                            orderId={order.id}
                            viewer="seller"
                            url="/api/seller-orders"
                            sendMethod="POST"
                          />
                        )}
                      </div>
                    )}

                    <div className="seller-order-status">
                      <strong>Fulfilment status</strong>

                      <span className="product-status pending">
                        {order.status || 'Awaiting Payment'}
                      </span>
                    </div>

                    {order.trackingNumber && (
                      <div className="seller-order-tracking">
                        <p>
                          Tracking number:{' '}
                          <strong>{order.trackingNumber}</strong>
                        </p>

                        {order.shippingCarrier && (
                          <p>
                            Carrier:{' '}
                            <strong>{order.shippingCarrier}</strong>
                          </p>
                        )}
                      </div>
                    )}

                    {order.paymentStatus === 'Paid' && (
                      <div className="seller-order-actions">
                        {order.status === 'Awaiting Fulfilment' && (
                          <button
                            type="button"
                            className="marketplace-button"
                            onClick={() =>
                              void updateSellerOrder(order, 'Processing')
                            }
                            disabled={updatingOrder === order.id}
                          >
                            {updatingOrder === order.id
                              ? 'Updating...'
                              : 'Start Processing'}
                          </button>
                        )}

                        {order.status === 'Processing' && (
                          <>
                            <label>
                              Tracking Number
                              <input
                                value={trackingInputs[order.id] || ''}
                                onChange={(e) =>
                                  setTrackingInputs((current) => ({
                                    ...current,
                                    [order.id]: e.target.value,
                                  }))
                                }
                                placeholder="Enter tracking number"
                              />
                            </label>

                            <label>
                              Shipping Carrier
                              <input
                                value={carrierInputs[order.id] || ''}
                                onChange={(e) =>
                                  setCarrierInputs((current) => ({
                                    ...current,
                                    [order.id]: e.target.value,
                                  }))
                                }
                                placeholder="Enter delivery company"
                              />
                            </label>

                            <button
                              type="button"
                              className="marketplace-button"
                              onClick={() =>
                                void updateSellerOrder(order, 'Shipped')
                              }
                              disabled={updatingOrder === order.id}
                            >
                              {updatingOrder === order.id
                                ? 'Updating...'
                                : 'Mark as Shipped'}
                            </button>
                          </>
                        )}

                        {order.status === 'Shipped' && (
                          <button
                            type="button"
                            className="marketplace-button"
                            onClick={() =>
                              void updateSellerOrder(order, 'Delivered')
                            }
                            disabled={updatingOrder === order.id}
                          >
                            {updatingOrder === order.id
                              ? 'Updating...'
                              : 'Mark as Delivered'}
                          </button>
                        )}

                        {order.status === 'Delivered' && (
                          <p className="seller-order-complete">
                            Order delivered successfully.
                          </p>
                        )}
                      </div>
                    )}

                    {order.paymentStatus !== 'Paid' && (
                      <p className="seller-order-payment-notice">
                        Waiting for secure payment confirmation. Fulfilment
                        actions will become available once payment is verified.
                      </p>
                    )}

                    {orderNotice?.id === order.id && (
                      <p
                        className={
                          orderNotice.ok
                            ? 'marketplace-success'
                            : 'marketplace-error'
                        }
                        role={orderNotice.ok ? 'status' : 'alert'}
                      >
                        {orderNotice.text}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* PRODUCT MANAGEMENT HEADING */}
          <div className="seller-products-heading">
            <div>
              <span className="marketplace-eyebrow">
                SELLER DASHBOARD
              </span>

              <h3>Manage Products</h3>

              <p>
                Add products and publish them instantly to your approved store.
              </p>
            </div>

            {!showProductForm && (
              <button
                type="button"
                className="marketplace-button"
                onClick={() => {
                  setShowProductForm(true)
                  setEditingProductId(null)
                  setProductName('')
                  setProductDescription('')
                  setProductPrice('')
                  setProductCategory('Fashion')
                  setProductImage(null)
                  setError('')
                  setMessage('')
                }}
              >
                <Plus size={18} />
                Add Product
              </button>
            )}
          </div>

          {/* PRODUCT FORM */}
          {showProductForm && (
            <form
              className="marketplace-form product-form"
              onSubmit={handleProductSubmit}
            >
              <div className="marketplace-form-heading">
                <Package size={24} />

                <div>
                  <h3>
                    {editingProductId ? 'Edit Product' : 'New Product'}
                  </h3>

                  <p>
                    {editingProductId
                      ? 'Update your product details and publish your changes.'
                      : 'Your product will be published as soon as you add it.'}
                  </p>
                </div>
              </div>

              <label htmlFor="product-name">Product Name</label>

              <input
                id="product-name"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                maxLength={100}
                placeholder="Enter product name"
                required
                disabled={savingProduct}
              />

              <label htmlFor="product-category">Category</label>

              <select
                id="product-category"
                value={productCategory}
                onChange={(e) => setProductCategory(e.target.value)}
                disabled={savingProduct}
              >
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <label htmlFor="product-price">Price (₦)</label>

              <input
                id="product-price"
                type="number"
                min="1"
                step="0.01"
                value={productPrice}
                onChange={(e) => setProductPrice(e.target.value)}
                placeholder="Enter price"
                required
                disabled={savingProduct}
              />

              <label htmlFor="product-description">
                Product Description
              </label>

              <textarea
                id="product-description"
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="Describe your product..."
                required
                disabled={savingProduct}
              />

              <label htmlFor="product-image">Product Image</label>

              <div className="product-image-upload">
                <ImagePlus size={24} />

                <input
                  id="product-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) =>
                    setProductImage(e.target.files?.[0] || null)
                  }
                  disabled={savingProduct}
                  required={!editingProductId}
                />

                <p>JPG, PNG or WEBP. Maximum size: 5MB.</p>

                {productImage && <strong>{productImage.name}</strong>}

                {!productImage && editingProductId && (
                  <p>Leave empty to keep the existing image.</p>
                )}
              </div>

              <div className="product-form-actions">
                <button
                  type="submit"
                  className="marketplace-button"
                  disabled={savingProduct}
                >
                  {savingProduct ? (
                    <>
                      <Loader2
                        className="marketplace-spinner"
                        size={18}
                      />
                      Saving product...
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      {editingProductId
                        ? 'Save Product Changes'
                        : 'Publish Product'}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="product-cancel-button"
                  onClick={resetProductForm}
                  disabled={savingProduct}
                >
                  <X size={18} />
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* PRODUCT LIST */}
          <div className="seller-product-list">
            <h3>Your Products ({products.length})</h3>

            {loadingProducts ? (
              <div className="marketplace-loading">
                <Loader2
                  className="marketplace-spinner"
                  size={24}
                />
                <p>Loading products...</p>
              </div>
            ) : products.length === 0 ? (
              <div className="seller-empty-products">
                <Package size={38} />
                <h4>No products yet</h4>
                <p>
                  Add your first product to start building your store.
                </p>
              </div>
            ) : (
              <div className="seller-product-grid">
                {products.map((product) => (
                  <article
                    className="seller-product-card"
                    key={product.id}
                  >
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                    />

                    <div className="seller-product-content">
                      <span
                        className={`product-status ${product.status.toLowerCase()}`}
                      >
                        {product.status}
                      </span>

                      <h4>{product.name}</h4>

                      <p className="seller-product-category">
                        {product.category}
                      </p>

                      <strong className="seller-product-price">
                        {naira.format(product.price)}
                      </strong>

                      <div className="seller-product-actions">
                        <button
                          type="button"
                          onClick={() => handleEditProduct(product)}
                        >
                          <Pencil size={16} />
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDeleteProduct(product)}
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!store && (
        <p className="marketplace-hint">
          Your store will not become public until Rex Groups approves
          your application.
        </p>
      )}
    </section>
  )
}
