import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import type { User } from 'firebase/auth'
import './quick-rate.css'

interface Props {
  user: User | null
  storeId: string
  storeName: string
}

interface Mine {
  rating: number
  comment: string
}

// "How was your order?" prompt shown on a delivered order.
// Uses the existing /api/store-ratings endpoint (the server re-checks that the
// buyer really has a delivered order from this store).
export default function QuickRate({ user, storeId, storeName }: Props) {
  const [loading, setLoading] = useState(true)
  const [canRate, setCanRate] = useState(false)
  const [mine, setMine] = useState<Mine | null>(null)
  const [editing, setEditing] = useState(false)
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [thanks, setThanks] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!user) {
        setLoading(false)
        return
      }
      try {
        const token = await user.getIdToken()
        const response = await fetch(`/api/store-ratings?storeId=${encodeURIComponent(storeId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const data = (await response.json().catch(() => ({}))) as { canRate?: boolean; myRating?: Mine | null }
        if (cancelled) return
        if (response.ok) {
          setCanRate(Boolean(data.canRate))
          setMine(data.myRating ?? null)
        }
      } catch {
        // The prompt is optional; stay hidden if it cannot load.
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user, storeId])

  async function submit() {
    if (!user || stars < 1 || busy) return
    setBusy(true)
    setError('')
    try {
      const token = await user.getIdToken()
      const response = await fetch('/api/store-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ storeId, rating: stars, comment }),
      })
      const data = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not save your rating.')
      setMine({ rating: stars, comment: comment.trim() })
      setEditing(false)
      setThanks(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your rating.')
    } finally {
      setBusy(false)
    }
  }

  if (loading || !user || !canRate) return null

  const shown = hover || stars

  if (mine && !editing) {
    return (
      <div className="quick-rate done">
        <p>
          {thanks ? 'Thank you for rating! ' : ''}You rated {storeName}{' '}
          <span className="quick-rate-stars" aria-label={`${mine.rating} out of 5 stars`}>
            {'★'.repeat(mine.rating)}
            {'☆'.repeat(5 - mine.rating)}
          </span>
        </p>
        <button
          type="button"
          className="quick-rate-link"
          onClick={() => {
            setStars(mine.rating)
            setComment(mine.comment)
            setEditing(true)
            setThanks(false)
          }}
        >
          Change rating
        </button>
      </div>
    )
  }

  return (
    <div className="quick-rate">
      <strong>How was your order from {storeName}?</strong>
      <div className="quick-rate-row" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={n <= shown ? 'on' : ''}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setStars(n)}
          >
            <Star size={26} fill={n <= shown ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        ))}
      </div>

      {stars > 0 && (
        <>
          <textarea
            rows={2}
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell others about it (optional)"
            aria-label="Review comment"
          />
          <div className="quick-rate-actions">
            <button type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? 'Saving…' : mine ? 'Update rating' : 'Submit rating'}
            </button>
            {editing && (
              <button type="button" className="quick-rate-link" onClick={() => setEditing(false)}>
                Cancel
              </button>
            )}
          </div>
        </>
      )}

      {error && <p className="quick-rate-error" role="alert">{error}</p>}
    </div>
  )
}
