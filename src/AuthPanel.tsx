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

import { auth, googleProvider } from './firebase'

type Mode = 'login' | 'register'

interface AuthContextValue {
  user: User | null
  openPanel: () => void
  signOutUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthButton must be used inside <AuthProvider>')
  return ctx
}

function friendlyError(error: unknown, fallback: string): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.'
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in.'
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google sign-in was cancelled.'
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.'
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised in Firebase. Add it under Authentication > Settings > Authorized domains.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    default:
      return error instanceof Error ? error.message : fallback
  }
}

/**
 * Holds all auth state in ONE place and renders the sign-in modal.
 * Place it inside the `.app` element (so the CSS variables apply) but
 * outside the header (so `position: fixed` is not trapped by the header's
 * backdrop-filter).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!auth) return

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      if (nextUser) {
        setOpen(false)
        setPassword('')
        setMessage('')
      }
    })
  }, [])

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!auth) {
      setMessage('Firebase is not configured.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      if (mode === 'register') {
        const result = await createUserWithEmailAndPassword(auth, email, password)
        if (name.trim()) {
          await updateProfile(result.user, { displayName: name.trim() })
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
      // onAuthStateChanged closes the modal on success.
    } catch (error) {
      setMessage(friendlyError(error, 'Something went wrong.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (!auth) {
      setMessage('Firebase is not configured.')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      // Popup works on every modern browser. signInWithRedirect breaks when
      // the site is not on the same domain as Firebase's authDomain.
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      setMessage(friendlyError(error, 'Google sign-in failed.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    if (!auth || !email.trim()) {
      setMessage('Enter your email address first.')
      return
    }

    try {
      await sendPasswordResetEmail(auth, email.trim())
      setMessage('Password reset email sent.')
    } catch (error) {
      setMessage(friendlyError(error, 'Could not send reset email.'))
    }
  }

  async function signOutUser() {
    if (!auth) return
    await signOut(auth)
  }

  const value: AuthContextValue = {
    user,
    openPanel: () => setOpen(true),
    signOutUser,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}

      {open && !user && (
        <>
          <div className="auth-overlay" onClick={() => setOpen(false)} />

          <div className="auth-box" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <h2 id="auth-title">
              {mode === 'login' ? 'Welcome back' : 'Create your account'}
            </h2>

            {!auth && (
              <p role="alert">
                Sign-in is not available yet: the Firebase environment
                variables are missing.
              </p>
            )}

            <form onSubmit={handleSubmit}>
              {mode === 'register' && (
                <label>
                  Full name
                  <input
                    value={name}
                    autoComplete="name"
                    onChange={(e) => setName(e.target.value)}
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
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  value={password}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </label>

              <button type="submit" disabled={loading}>
                {loading
                  ? 'Please wait...'
                  : mode === 'login'
                    ? 'Sign in'
                    : 'Create account'}
              </button>
            </form>

            {mode === 'login' && (
              <button type="button" onClick={handleReset}>
                Forgot password?
              </button>
            )}

            <button type="button" onClick={handleGoogle} disabled={loading}>
              Continue with Google
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setMessage('')
              }}
            >
              {mode === 'login'
                ? 'Create an account'
                : 'Already have an account? Sign in'}
            </button>

            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>

            {message && <p role="status">{message}</p>}
          </div>
        </>
      )}
    </AuthContext.Provider>
  )
}

/** The header button. Safe to render in several places; they share one state. */
export function AuthButton({ onOpen }: { onOpen?: () => void }) {
  const { user, openPanel, signOutUser } = useAuthContext()

  if (user) {
    return (
      <div className="auth-user">
        <button type="button" onClick={signOutUser}>
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="auth-panel">
      <button
        type="button"
        onClick={() => {
          onOpen?.()
          openPanel()
        }}
      >
        Sign in / Register
      </button>
    </div>
  )
}
