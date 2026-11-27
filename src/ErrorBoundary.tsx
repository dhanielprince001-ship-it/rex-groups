
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  failed: boolean
}

// Shows a friendly message instead of a blank white screen if a page crashes.
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div
        role="alert"
        style={{
          minHeight: '60vh',
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          padding: '40px 20px',
          color: 'inherit',
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 10px' }}>Something went wrong.</h2>
          <p style={{ margin: '0 0 20px', opacity: 0.75 }}>
            This page hit a problem. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 20px',
              border: 0,
              borderRadius: 5,
              background: '#b7e84b',
              color: '#18210d',
              fontWeight: 800,
              cursor: 'pointer',
              marginRight: 10,
            }}
          >
            Reload page
          </button>
          <a href="/" style={{ color: 'inherit' }}>Go to home</a>
        </div>
      </div>
    )
  }
}
