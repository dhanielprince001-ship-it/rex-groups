
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore'

import { auth, db, googleProvider } from './firebase'

type Mode = 'login' | 'register'

interface AuthContextValue {
  user: User | null
  ready: boolean
  notice: string
  setNotice: (message: string) => void
  refresh: () => void
  signOutUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)

  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return ctx
}

function friendlyError(error: unknown, fallback: string): string {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.'

    case 'auth/email-already-in-use':
      return 'This email already has an account. Please sign in.'

    case 'auth/weak-password':
      return 'Password must contain at least 6 characters.'

    case 'auth/invalid-email':
      return 'Please enter a valid email address.'

    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait and try again.'

    case 'auth/unauthorized-domain':
      return `Firebase rejected this domain: ${window.location.hostname}. Add it under Firebase Authentication > Settings > Authorized domains.`

    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window.'

    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before completion.'

    case 'auth/network-request-failed':
      return 'Network error. Check your internet connection.'

    default:
      if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error
      ) {
        return String((error as { message: unknown }).message)
      }

      return fallback
  }
}

// CUSTOMER PROFILE SYNCHRONISATION

async function syncCustomerProfile(user: User) {
  const firestore = db

  if (!firestore) {
    console.warn('Firestore is not configured. Profile sync skipped.')
    return
  }

  const profileRef = doc(firestore, 'profiles', user.uid)
  const existingProfile = await getDoc(profileRef)

  const profileData = {
    uid: user.uid,
    name: user.displayName || user.email || 'Customer',
    email: user.email || '',
    photoURL: user.photoURL || '',
    provider: user.providerData[0]?.providerId || 'unknown',
  }

  if (existingProfile.exists()) {
    await updateDoc(profileRef, {
      ...profileData,
      lastSignInAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  } else {
    await setDoc(profileRef, {
      ...profileData,
      phone: '',
      createdAt: serverTimestamp(),
      lastSignInAt: serverTimestamp(),
    })
  }
}

// AUTHENTICATION PROVIDER

export function AuthProvider({
  children,
}: {
  children: ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [, setVersion] = useState(0)

  useEffect(() => {
    if (!auth) {
      setReady(true)
      return
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      async (nextUser) => {
        if (nextUser) {
          try {
            await syncCustomerProfile(nextUser)
          } catch (error) {
            console.error('Customer profile sync failed:', error)
          }
        }

        setUser(nextUser)
        setReady(true)
      },
      (error) => {
        setNotice(
          friendlyError(error, 'Could not check your account.'),
        )
        setReady(true)
      },
    )

    return unsubscribe
  }, [])

  async function signOutUser() {
    if (!auth) return

    try {
      setNotice('')
      await signOut(auth)
      setNotice('You have signed out successfully.')
    } catch (error) {
      setNotice(friendlyError(error, 'Could not sign out.'))
    }
  }

  const value: AuthContextValue = {
    user,
    ready,
    notice,
    setNotice,
    refresh: () => setVersion((n) => n + 1),
    signOutUser,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// AUTH BUTTON

export function AuthButton({
  onOpen,
}: {
  onOpen?: () => void
}) {
  const { user, ready } = useAuth()

  if (!ready) return null

  return (
    <div className="auth-panel">
      <a href="#account" onClick={onOpen}>
        {user ? 'My account' : 'Sign in / Register'}
      </a>
    </div>
  )
}

// ACCOUNT HELPERS

function providerLabel(user: User) {
  const id = user.providerData[0]?.providerId

  if (id === 'google.com') return 'Google'
  if (id === 'password') return 'Email and password'

  return id ?? 'Unknown'
}

function formatDate(value?: string) {
  if (!value) return '—'

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
}

// CUSTOMER ENQUIRY HISTORY

type CustomerEnquiry = {
  id: string
  name?: string
  business?: string
  message?: string
  status?: string
  createdAt?: {
    toDate: () => Date
  }
}

function CustomerEnquiryHistory({ user }: { user: User }) {
  const [items, setItems] = useState<CustomerEnquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const firestore = db

    if (!firestore) {
      setError('Enquiry history is currently unavailable.')
      setLoading(false)
      return
    }

    const enquiriesQuery = query(
      collection(firestore, 'enquiries'),
      where('userId', '==', user.uid),
    )

    const unsubscribe = onSnapshot(
      enquiriesQuery,
      (snapshot) => {
        const results = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })) as CustomerEnquiry[]

        results.sort((a, b) => {
          const dateA = a.createdAt?.toDate().getTime() || 0
          const dateB = b.createdAt?.toDate().getTime() || 0

          return dateB - dateA
        })

        setItems(results)
        setLoading(false)
        setError('')
      },
      (err) => {
        console.error('Enquiry history error:', err)
        setError('Could not load your enquiry history.')
        setLoading(false)
      },
    )

    return unsubscribe
  }, [user.uid])

  return (
    <div className="account-history">
      <div className="account-history-heading">
        <h3>Your enquiries</h3>
        <span>{items.length} submitted</span>
      </div>

      {loading ? (
        <p>Loading your enquiries...</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : items.length === 0 ? (
        <p>You have not submitted any linked enquiries yet.</p>
      ) : (
        <div className="account-enquiry-list">
          {items.map((item) => {
            let date = 'Date unavailable'

            try {
              date =
                item.createdAt?.toDate().toLocaleDateString() || date
            } catch {
              // Keep fallback date
            }

            const status = item.status || 'Pending'

            return (
              <article
                className="account-enquiry"
                key={item.id}
              >
                <div>
                  <strong>
                    {item.business || 'General enquiry'}
                  </strong>

                  <p>{item.message}</p>
                  <small>{date}</small>
                </div>

                <span
                  className={`admin-status ${status.toLowerCase()}`}
                >
                  {status}
                </span>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

// CUSTOMER ACCOUNT CENTRE

function AccountCenter({ user }: { user: User }) {
  const { setNotice, signOutUser } = useAuth()

  const [name, setName] = useState(user.displayName ?? '')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  const usesPassword = user.providerData.some(
    (p) => p.providerId === 'password',
  )

  const label =
    user.displayName || user.email || 'Your account'

  useEffect(() => {
    const firestore = db

    if (!firestore) return

    const loadProfile = async () => {
      try {
        const profileRef = doc(
          firestore,
          'profiles',
          user.uid,
        )

        const profile = await getDoc(profileRef)

        if (profile.exists()) {
          setPhone(profile.data().phone || '')
        }
      } catch (error) {
        console.error(
          'Could not load customer profile:',
          error,
        )
      }
    }

    void loadProfile()
  }, [user.uid])

  async function saveDetails(
    e: FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault()

    if (!name.trim()) {
      setNotice('Please enter your name.')
      return
    }

    const firestore = db

    if (!firestore) {
      setNotice('Your profile service is unavailable.')
      return
    }

    setSaving(true)
    setNotice('')

    try {
      const profileRef = doc(
        firestore,
        'profiles',
        user.uid,
      )

      await updateProfile(user, {
        displayName: name.trim(),
      })

      await updateDoc(profileRef, {
        name: name.trim(),
        phone: phone.trim(),
        updatedAt: serverTimestamp(),
      })

      setNotice('Your account details have been updated.')
    } catch (error) {
      setNotice(
        friendlyError(
          error,
          'Could not update your details.',
        ),
      )
    } finally {
      setSaving(false)
    }
  }

  async function sendReset() {
    if (!auth || !user.email) return

    try {
      await sendPasswordResetEmail(auth, user.email)

      setNotice(
        `Password reset email sent to ${user.email}.`,
      )
    } catch (error) {
      setNotice(
        friendlyError(error, 'Could not send reset email.'),
      )
    }
  }

  return (
    <>
      <div className="account-profile">
        {user.photoURL ? (
          <img
            className="account-avatar"
            src={user.photoURL}
            alt="Profile"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className="account-avatar"
            aria-hidden="true"
          >
            {label.charAt(0).toUpperCase()}
          </div>
        )}

        <h2>{label}</h2>

        {user.email && <p>{user.email}</p>}
      </div>

      <dl className="account-details">
        <div>
          <dt>Sign-in method</dt>
          <dd>{providerLabel(user)}</dd>
        </div>

        <div>
          <dt>Email verified</dt>
          <dd>{user.emailVerified ? 'Yes' : 'No'}</dd>
        </div>

        <div>
          <dt>Member since</dt>
          <dd>{formatDate(user.metadata.creationTime)}</dd>
        </div>

        <div>
          <dt>Last sign-in</dt>
          <dd>{formatDate(user.metadata.lastSignInTime)}</dd>
        </div>
      </dl>

      <form
        onSubmit={saveDetails}
        className="account-edit-form"
      >
        <label>
          Full name

          <input
            value={name}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
          />
        </label>

        <label>
          Phone number

          <input
            type="tel"
            value={phone}
            autoComplete="tel"
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            placeholder="+234..."
          />
        </label>

        <button type="submit" disabled={saving}>
          {saving
            ? 'Saving...'
            : 'Save account details'}
        </button>
      </form>

      {usesPassword && (
        <button type="button" onClick={sendReset}>
          Send password reset email
        </button>
      )}

      <CustomerEnquiryHistory user={user} />

      <button type="button" onClick={signOutUser}>
        Sign out
      </button>
    </>
  )
}

// MAIN AUTH SECTION

export function AuthSection() {
  const { user, ready, notice, setNotice } = useAuth()

  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(
    e: FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault()

    if (!auth) {
      setNotice('Firebase is not configured.')
      return
    }

    setLoading(true)
    setNotice('')

    try {
      if (mode === 'register') {
        const result = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        )

        if (name.trim()) {
          await updateProfile(result.user, {
            displayName: name.trim(),
          })
        }

        await syncCustomerProfile(result.user)

        setNotice('Your account has been created.')
      } else {
        const result = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        )

        await syncCustomerProfile(result.user)

        setNotice('You have signed in successfully.')
      }

      setPassword('')
    } catch (error) {
      setNotice(
        friendlyError(error, 'Something went wrong.'),
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (!auth || loading) return

    setLoading(true)
    setNotice('Opening Google sign-in...')

    try {
      const result = await signInWithPopup(
        auth,
        googleProvider,
      )

      await result.user.reload()
      await syncCustomerProfile(result.user)

      setNotice(
        `Welcome, ${
          result.user.displayName ||
          result.user.email ||
          'you'
        }!`,
      )
    } catch (error) {
      setNotice(
        friendlyError(error, 'Google sign-in failed.'),
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    if (!auth || !email.trim()) {
      setNotice('Enter your email address first.')
      return
    }

    try {
      await sendPasswordResetEmail(auth, email.trim())
      setNotice('Password reset email sent.')
    } catch (error) {
      setNotice(
        friendlyError(error, 'Could not send reset email.'),
      )
    }
  }

  return (
    <section
      className="section-wrap section-block account-section"
      id="account"
    >
      <div className="section-kicker">
        {user
          ? '06 — ACCOUNT CENTER'
          : '06 — YOUR ACCOUNT'}
      </div>

      <div className="account-card">
        {!ready ? (
          <p>Loading your account...</p>
        ) : user ? (
          <AccountCenter user={user} />
        ) : (
          <>
            <h2>
              {mode === 'login'
                ? 'Welcome back'
                : 'Create your account'}
            </h2>

            {!auth && (
              <p role="alert">
                Sign-in is unavailable because Firebase
                environment variables are missing.
              </p>
            )}

            <form onSubmit={handleSubmit}>
              {mode === 'register' && (
                <label>
                  Full name

                  <input
                    value={name}
                    autoComplete="name"
                    onChange={(e) =>
                      setName(e.target.value)
                    }
                    maxLength={100}
                    required
                  />
                </label>
              )}

              <label>
                Email address

                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  required
                />
              </label>

              <label>
                Password

                <input
                  type="password"
                  value={password}
                  autoComplete={
                    mode === 'login'
                      ? 'current-password'
                      : 'new-password'
                  }
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  minLength={6}
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading || !auth}
              >
                {loading
                  ? 'Please wait...'
                  : mode === 'login'
                    ? 'Sign in'
                    : 'Create account'}
              </button>
            </form>

            {mode === 'login' && (
              <button
                type="button"
                onClick={handleReset}
              >
                Forgot password?
              </button>
            )}

            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading || !auth}
            >
              {loading
                ? 'Connecting...'
                : 'Continue with Google'}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(
                  mode === 'login'
                    ? 'register'
                    : 'login',
                )

                setNotice('')
              }}
            >
              {mode === 'login'
                ? 'Create an account'
                : 'Already have an account? Sign in'}
            </button>
          </>
        )}

        {notice && (
          <p role="status" aria-live="polite">
            {notice}
          </p>
        )}
      </div>
    </section>
  )
}
