
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'

import { useAuth } from './AuthPanel'
import { Stars } from './StoreRatings'

interface Review {
  id: string
  rating: number
  comment: string
  customerName: string
  createdAt: number
}

interface ReviewsResponse {
  average: number
  count: number
  canReview: boolean
  myReview: { rating: number; comment: string } | null
  reviews: Review[]
  error?: string
}

// Reviews for ONE product. Only buyers who received it can write a review
// (the server checks this), and each buyer has one review they can edit.
export default function ProductReviews({
  productId,
  onSummary,
}: {
  productId: string
  onSummary?: (average: number, count: number) => void
}) {
  const { user, ready } = useAuth()
  const [data, setData] = useState<ReviewsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [thanks, setThanks] = useState(false)

  const load = useCallback(async () => {
    try {
      const headers: Record<string, string> = {}
      if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`

      const response = await fetch(`/api/store-ratings?productId=${encodeURIComponent(productId)}`, {
        headers,
        cache: 'no-store',
      })
      const json = (await response.json().catch(() => ({}))) as ReviewsResponse

      if (!response.ok) throw new Error(json.error || 'Could not load reviews.')

      setData(json)
      setLoadError('')
      onSummary?.(json.average, json.count)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load reviews.')
    } finally {
      setLoading(false)
    }
  }, [user, productId, onSummary])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user || stars < 1 || busy) return

    setBusy(true)
    setError('')

    try {
      const token = await user.getIdToken()
      const response = await fetch('/api/store-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId, rating: stars, comment }),
      })
      const json = (await response.json().catch(() => ({}))) as { error?: string }

      if (!response.ok) throw new Error(json.error || 'Could not save your review.')

      setEditing(false)
      setThanks(true)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your review.')
    } finally {
      setBusy(false)
    }
  }

  const shown = hover || stars
  const mine = data?.myReview
  const showForm = !!data?.canReview && (!mine || editing)

  return (
    <section className="rex-product-reviews" id="reviews" aria-labelledby="product-reviews-title">
      <h2 id="product-reviews-title">Customer reviews</h2>

      {loading && <p className="rex-pp-muted">Loading reviews…</p>}
      {loadError && <p className="rex-pp-error" role="alert">{loadError}</p>}

      {data && (
        <>
          <div className="rex-pr-summary">
            {data.count > 0 ? (
              <>
                <Stars value={data.average} size={18} />
                <strong>{data.average.toFixed(1)}</strong>
                <span className="rex-pp-muted">
                  ({data.count} {data.count === 1 ? 'review' : 'reviews'})
                </span>
              </>
            ) : (
              <span className="rex-pp-muted">No reviews yet.</span>
            )}
          </div>

          {mine && !editing && (
            <div className="rex-pr-mine">
              <span>
                {thanks ? 'Thank you for your review! ' : ''}You rated this product{' '}
                <Stars value={mine.rating} size={14} />
              </span>
              <button
                type="button"
                className="rex-pr-link"
                onClick={() => {
                  setStars(mine.rating)
                  setComment(mine.comment)
                  setEditing(true)
                  setThanks(false)
                }}
              >
                Change review
              </button>
            </div>
          )}

          {showForm && (
            <form className="rex-pr-form" onSubmit={submit}>
              <strong>{mine ? 'Update your review' : 'Review this product'}</strong>

              <div className="rex-pr-stars" role="radiogroup" aria-label="Your rating">
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

              <textarea
                rows={3}
                maxLength={500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What did you think? (optional)"
                aria-label="Review comment"
              />

              {error && <p className="rex-pp-error" role="alert">{error}</p>}

              <div className="rex-pr-actions">
                <button type="submit" disabled={busy || stars < 1}>
                  {busy ? 'Saving…' : mine ? 'Update review' : 'Submit review'}
                </button>
                {editing && (
                  <button type="button" className="rex-pr-link" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}

          {!data.canReview && !mine && (
            <p className="rex-pp-muted">
              {user
                ? 'Only buyers who have received this product can review it.'
                : (
                  <>
                    <Link to="/#account">Sign in</Link> to review this product after you receive it.
                  </>
                )}
            </p>
          )}

          <ul className="rex-pr-list">
            {data.reviews.map((review) => (
              <li key={review.id}>
                <div className="rex-pr-head">
                  <Stars value={review.rating} size={14} />
                  <strong>{review.customerName}</strong>
                  {review.createdAt > 0 && (
                    <span className="rex-pp-muted">
                      {new Date(review.createdAt * 1000).toLocaleDateString()}
                    </span>
                  )}
                  <span className="rex-pr-verified">Verified buyer</span>
                </div>
                {review.comment && <p>{review.comment}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
