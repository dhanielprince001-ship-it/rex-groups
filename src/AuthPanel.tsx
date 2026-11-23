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
  signInWithRedirect,
  getRedirectResult,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'

import { auth, googleProvider } from './firebase'

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

function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('Auth components must be used inside <AuthProvider>')
  return ctx
}

function scrollToAccount() {
  requestAnimationFrame(() => {
    document.getElementById('account')?.scrollIntoView({ behavior: 'smooth' })
  })
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
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email using a different sign-in method.'
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled. Enable it in Firebase Console > Authentication > Sign-in method.'
    case 'auth/unauthorized-domain':
      return 'This domain is not authorised in Firebase. Add it under Authentication > Settings > Authorized domains.'
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.'
    default:
      return error instanceof Error ? error.message : fallback
  }
}

/** Holds all auth state in one place. Wrap the whole page with it. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [, setVersion] = useState(0)

  useEffect(() => {
    if (!auth) {
      setReady(true)
      return
    }

    // Completes a Google sign-in after the browser returns from Google.
    getRedirectResult(auth)
      .then((result) => {
        if (result) scrollToAccount()
      })
      .catch((error) => {
        setNotice(friendlyError(error, 'Google sign-in failed.'))
        scrollToAccount()
      })

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setReady(true)
    })
  }, [])

  async function signOutUser() {
    if (!auth) return
    await signOut(auth)
  }

  const value: AuthContextValue = {
    user,
    ready,
    notice,
    setNotice,
    // The Firebase user object is mutated in place (e.g. after updateProfile),
    // so bump a counter to force a re-render.
    refresh: () => setVersion((n) => n + 1),
    signOutUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Header button: jumps to the account section, or signs out. No popups. */
export function AuthButton({ onOpen }: { onOpen?: () => void }) {
  const { user, signOutUser } = useAuthContext()

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
      <a href="#account" onClick={onOpen}>
        Sign in / Register
      </a>
    </div>
  )
}

/** The sign-in / register form, shown inline on the page. */
export function AuthSection() {
  const { user, ready, notice, setNotice, refresh, signOutUser } = useAuthContext()

  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!auth) {
      setNotice('Firebase is not configured.')
      return
    }

    setLoading(true)
    setNotice('')

    try {
      if (mode === 'register') {
        const result = await createUserWithEmailAndPassword(auth, email, password)
        if (name.trim()) {
          await updateProfile(result.user, { displayName: name.trim() })
          refresh()
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
      setPassword('')
    } catch (error) {
      setNotice(friendlyError(error, 'Something went wrong.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (!auth) {
      setNotice('Firebase is not configured.')
      return
    }

    setLoading(true)
    setNotice('')

    try {
      // Full-page redirect to Google (no popup window). The result is
      // picked up by getRedirectResult in AuthProvider when the user returns.
      await signInWithRedirect(auth, googleProvider)
    } catch (error) {
      setNotice(friendlyError(error, 'Google sign-in failed.'))
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
      setNotice(friendlyError(error, 'Could not send reset email.'))
    }
  }

  return (
    <section className="section-wrap section-block account-section" id="account">
      <div className="section-kicker">06 — YOUR ACCOUNT</div>

      <div className="account-card">
        {!ready ? (
          <p>Loading…</p>
        ) : user ? (
          <>
            <h2>Welcome, {user.displayName || user.email}</h2>
            <p>You are signed in.</p>
            <button type="button" onClick={signOutUser}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>

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
                setNotice('')
              }}
            >
              {mode === 'login'
                ? 'Create an account'
                : 'Already have an account? Sign in'}
            </button>
          </>
        )}

        {notice && <p role="status">{notice}</p>}
      </div>
    </section>
  )
}
