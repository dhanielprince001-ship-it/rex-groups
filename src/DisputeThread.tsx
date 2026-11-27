
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { User } from 'firebase/auth'
import './dispute-thread.css'

interface ThreadMessage {
  id: string
  role: string
  authorName: string
  text: string
  createdAt: number
}

interface Props {
  user: User | null
  orderId: string
  viewer: 'buyer' | 'seller' | 'admin'
  url: string
  sendMethod: 'POST' | 'PATCH'
  sendExtra?: Record<string, unknown>
}

const LABELS: Record<string, string> = { buyer: 'Buyer', seller: 'Seller', admin: 'Rex Groups' }

// One shared conversation for a disputed order: buyer, seller and admin.
export default function DisputeThread({ user, orderId, viewer, url, sendMethod, sendExtra }: Props) {
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)
  const lastCount = useRef(0)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const token = await user.getIdToken()
      const response = await fetch(`${url}?thread=${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const data = (await response.json().catch(() => ({}))) as { messages?: ThreadMessage[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not load the conversation.')
      setMessages(Array.isArray(data.messages) ? data.messages : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the conversation.')
    } finally {
      setLoading(false)
    }
  }, [user, url, orderId])

  // Load now, then refresh every 15 seconds while the tab is visible.
  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [load])

  // Scroll inside the chat box only when a NEW message arrives (never the page).
  useEffect(() => {
    if (messages.length > lastCount.current) {
      const box = endRef.current?.parentElement
      if (box) box.scrollTop = box.scrollHeight
    }
    lastCount.current = messages.length
  }, [messages])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!user || busy || !text.trim()) return
    setBusy(true)
    setError('')
    try {
      const token = await user.getIdToken()
      const response = await fetch(url, {
        method: sendMethod,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...sendExtra, sellerOrderId: orderId, text }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not send your message.')
      setText('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your message.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dispute-thread">
      <strong>Dispute conversation</strong>
      <p className="dispute-hint">
        The buyer, the seller and Rex Groups can all see this conversation. Keep it factual and polite.
      </p>

      <div className="dispute-box" aria-live="polite">
        {loading && <p className="dispute-empty">Loading…</p>}
        {!loading && messages.length === 0 && <p className="dispute-empty">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`dispute-msg ${m.role} ${m.role === viewer ? 'mine' : ''}`}>
            <small>
              {m.role === viewer ? 'You' : LABELS[m.role] || m.authorName}
              {m.createdAt ? ` · ${new Date(m.createdAt * 1000).toLocaleString()}` : ''}
            </small>
            <p>{m.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form className="dispute-form" onSubmit={send}>
        <textarea
          rows={2}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message…"
          aria-label="Dispute message"
        />
        <button type="submit" disabled={busy || !text.trim()}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>

      {error && <p className="dispute-error" role="alert">{error}</p>}
    </div>
  )
}
