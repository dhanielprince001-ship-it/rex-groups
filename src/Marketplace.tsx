

import { useEffect, useState, type FormEvent } from 'react'
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './AuthPanel'
import {
  Store,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  Loader2,
} from 'lucide-react'

type StoreData = {
  ownerId: string
  name: string
  description: string
  category: string
  status: 'Pending' | 'Approved' | 'Rejected' | 'Suspended'
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

export default function Marketplace() {
  const { user, ready } = useAuth()

  const [store, setStore] = useState<StoreData | null>(null)
  const [loadingStore, setLoadingStore] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Fashion')

  useEffect(() => {
    if (!ready) return

    if (!user || !db) {
      setStore(null)
      setLoadingStore(false)
      return
    }

    setLoadingStore(true)

    const storeRef = doc(db, 'stores', user.uid)

    const unsubscribe = onSnapshot(
      storeRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as StoreData
          setStore(data)
          setName(data.name || '')
          setDescription(data.description || '')
          setCategory(data.category || 'Other')
        } else {
          setStore(null)
        }

        setLoadingStore(false)
      },
      (err) => {
        console.error('Store loading error:', err)
        setError('Unable to load your store. Please try again.')
        setLoadingStore(false)
      }
    )

    return () => unsubscribe()
  }, [user, ready])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!user || !db) {
      setError('Please sign in before creating a store.')
      return
    }

    if (name.trim().length < 3) {
      setError('Your store name must contain at least 3 characters.')
      return
    }

    if (description.trim().length < 20) {
      setError('Please write at least 20 characters about your store.')
      return
    }

    if (store?.status === 'Rejected' || store?.status === 'Suspended') {
      setError('This store cannot currently be edited. Please contact Rex Groups.')
      return
    }

    setSaving(true)
    setError('')
    setMessage('')

    try {
      const storeRef = doc(db, 'stores', user.uid)

      if (store) {
        await updateDoc(storeRef, {
          name: name.trim(),
          description: description.trim(),
          category,
          updatedAt: serverTimestamp(),
        })

        setMessage('Your store details have been updated successfully.')
      } else {
        await setDoc(storeRef, {
          ownerId: user.uid,
          ownerName: user.displayName || user.email || 'Store Owner',
          name: name.trim(),
          description: description.trim(),
          category,
          status: 'Pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        setMessage('Your store application has been submitted. Awaiting approval.')
      }
    } catch (err) {
      console.error('Store submission error:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!ready || loadingStore) {
    return (
      <section className="marketplace-section">
        <div className="marketplace-loading">
          <Loader2 className="marketplace-spinner" size={26} />
          <p>Loading your store...</p>
        </div>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="marketplace-section" id="marketplace">
        <div className="marketplace-card">
          <Store size={36} />
          <h2>Start Your Online Store</h2>
          <p>
            Sign in to your Rex Groups account before applying to become a
            marketplace seller.
          </p>
          <a href="#account" className="marketplace-button">
            Sign In or Register
          </a>
        </div>
      </section>
    )
  }

  return (
    <section className="marketplace-section" id="marketplace">
      <div className="marketplace-heading">
        <span className="marketplace-eyebrow">REX GROUPS MARKETPLACE</span>
        <h2>{store ? 'Manage Your Store' : 'Create Your Online Store'}</h2>
        <p>
          Build your online business and reach customers through the Rex
          Groups marketplace.
        </p>
      </div>

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
                'Your application is waiting for Rex Groups admin approval.'}

              {store.status === 'Approved' &&
                'Your store is approved. You can update your details whenever you need to.'}

              {store.status === 'Rejected' &&
                'Your application was rejected. Please contact Rex Groups for assistance.'}

              {store.status === 'Suspended' &&
                'Your store is currently suspended. Please contact Rex Groups.'}
            </p>
          </div>
        </div>
      )}

      <form className="marketplace-form" onSubmit={handleSubmit}>
        <div className="marketplace-form-heading">
          <Store size={24} />
          <div>
            <h3>{store ? 'Store Information' : 'Store Application'}</h3>
            <p>
              {store
                ? 'Keep your store information up to date.'
                : 'Tell us about the store you want to create.'}
            </p>
          </div>
        </div>

        <label htmlFor="store-name">Store Name</label>
        <input
          id="store-name"
          type="text"
          placeholder="e.g. Rex Fashion Store"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          disabled={saving || store?.status === 'Rejected' || store?.status === 'Suspended'}
        />

        <label htmlFor="store-category">Business Category</label>
        <select
          id="store-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          disabled={saving || store?.status === 'Rejected' || store?.status === 'Suspended'}
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
          placeholder="Tell customers what your store sells..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={1000}
          required
          disabled={saving || store?.status === 'Rejected' || store?.status === 'Suspended'}
        />

        <p className="marketplace-hint">
          {description.length}/1000 characters
        </p>

        {error && (
          <div className="marketplace-error">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {message && (
          <div className="marketplace-success">
            <CheckCircle2 size={18} />
            {message}
          </div>
        )}

        {store?.status !== 'Rejected' && store?.status !== 'Suspended' && (
          <button
            type="submit"
            className="marketplace-button"
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="marketplace-spinner" size={18} />
                Saving...
              </>
            ) : (
              <>
                <Send size={18} />
                {store ? 'Save Store Changes' : 'Submit Store Application'}
              </>
            )}
          </button>
        )}

        {!store && (
          <p className="marketplace-hint">
            Your store will not become public until Rex Groups approves your
            application.
          </p>
        )}
      </form>
    </section>
  )
}
