
import { useEffect, useState, type FormEvent } from 'react'
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

function AuthPanel() {
  const [user, setUser] = useState<User | null>(null)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!auth) return

    const unsubscribe = onAuthStateChanged(auth, setUser)

    getRedirectResult(auth).catch((error) => {
      setMessage(error.message)
    })

    return unsubscribe
  }, [])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!auth) return setMessage('Firebase is not configured.')

    setLoading(true)
    setMessage('')

    try {
      if (mode === 'register') {
        const result = await createUserWithEmailAndPassword(
          auth, email, password
        )

        if (name.trim()) {
          await updateProfile(result.user, {
            displayName: name.trim(),
          })
        }

        setMessage('Your account has been created.')
      } else {
        await signInWithEmailAndPassword(auth, email, password)
        setMessage('You are signed in.')
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Something went wrong.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (!auth) return setMessage('Firebase is not configured.')

    try {
      setLoading(true)
      await signInWithRedirect(auth, googleProvider)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Google sign-in failed.'
      )
      setLoading(false)
    }
  }

  async function handleReset() {
    if (!auth || !email.trim()) {
      setMessage('Enter your email address first.')
      return
    }

    try {
      await sendPasswordResetEmail(auth, email)
      setMessage('Password reset email sent. Check your inbox.')
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Could not send reset email.'
      )
    }
  }

  async function handleLogout() {
    if (!auth) return
    await signOut(auth)
    setMessage('You have signed out.')
  }

  if (user) {
    return (
      <div className="auth-user">
        <span>Signed in: {user.displayName || user.email}</span>
        <button type="button" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div className="auth-panel">
      <button
        type="button"
        className="auth-open"
        onClick={() => setOpen(!open)}
      >
        {open ? 'Close' : 'Sign in / Register'}
      </button>

      {open && (
        <div className="auth-box">
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <label>
                Full name
                <input
                  value={name}
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
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>

            <button type="submit" disabled={loading}>
              {loading ? 'Please wait...' :
                mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {mode === 'login' && (
            <button type="button" onClick={handleReset}>
              Forgot password?
            </button>
          )}

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
          >
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

          {message && <p role="status">{message}</p>}
        </div>
      )}
    </div>
  )
}

export default AuthPanel
