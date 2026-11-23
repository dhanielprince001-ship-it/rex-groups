
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
    if (!auth) {
      setMessage('Firebase is not configured.')
      return
    }

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
        setMessage('Account created successfully.')
      } else {
        await signInWithEmailAndPassword(auth, email, password)
        setMessage('You are signed in.')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    if (!auth) {
      setMessage('Firebase is not configured.')
      return
    }

    try {
      setLoading(true)
      await signInWithRedirect(auth, googleProvider)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google sign-in failed.')
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
      setMessage('Password reset email sent.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send reset email.')
    }
  }

  async function handleLogout() {
    if (!auth) return
    await signOut(auth)
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', zIndex: 1000 }}>
      {user ? (
        <button type="button" onClick={handleLogout}
          style={buttonStyle}>
          Sign out
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={buttonStyle}
        >
          {open ? 'Close' : 'Sign in / Register'}
        </button>
      )}

      {open && !user && (
        <div style={panelStyle}>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>

          <form onSubmit={handleSubmit}>
            {mode === 'register' && (
              <label style={labelStyle}>
                Full name
                <input style={inputStyle} value={name}
                  onChange={e => setName(e.target.value)} required />
              </label>
            )}

            <label style={labelStyle}>
              Email address
              <input style={inputStyle} type="email" value={email}
                onChange={e => setEmail(e.target.value)} required />
            </label>

            <label style={labelStyle}>
              Password
              <input style={inputStyle} type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={6} required />
            </label>

            <button style={actionStyle} type="submit" disabled={loading}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {mode === 'login' && (
            <button style={secondaryStyle} type="button" onClick={handleReset}>
              Forgot password?
            </button>
          )}

          <button style={secondaryStyle} type="button"
            onClick={handleGoogle} disabled={loading}>
            Continue with Google
          </button>

          <button style={secondaryStyle} type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setMessage('')
            }}>
            {mode === 'login' ? 'Create an account' : 'Already have an account? Sign in'}
          </button>

          {message && <p role="status">{message}</p>}
        </div>
      )}
    </div>
  )
}

const buttonStyle = {
  background: '#b6f34a',
  color: '#101010',
  border: 'none',
  borderRadius: '8px',
  padding: '12px 16px',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
}

const panelStyle = {
  position: 'absolute' as const,
  top: 'calc(100% + 12px)',
  right: 0,
  width: 'min(320px, calc(100vw - 32px))',
  padding: '22px',
  borderRadius: '14px',
  background: '#171717',
  color: '#ffffff',
  border: '1px solid #444',
  boxShadow: '0 12px 35px rgba(0,0,0,.35)',
}

const labelStyle = {
  display: 'block',
  marginBottom: '12px',
  fontSize: '14px',
}

const inputStyle = {
  display: 'block',
  boxSizing: 'border-box' as const,
  width: '100%',
  padding: '11px',
  marginTop: '6px',
  borderRadius: '7px',
  border: '1px solid #555',
  background: '#252525',
  color: '#fff',
}

const actionStyle = {
  ...buttonStyle,
  width: '100%',
  marginTop: '8px',
}

const secondaryStyle = {
  display: 'block',
  width: '100%',
  marginTop: '10px',
  padding: '9px',
  border: '1px solid #555',
  borderRadius: '7px',
  background: 'transparent',
  color: '#fff',
  cursor: 'pointer',
}

export default AuthPanel
