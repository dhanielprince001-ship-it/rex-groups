
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Star } from 'lucide-react'

import { useAuth } from './AuthPanel'

type Review = {
  id: string
  rating: number
  comment: string
  customerName: string
  createdAt: number
}

type RatingsResponse = {
  average: number
  count: number
  canRate: boolean
  myRating: { rating: number; comment: string } | null
  reviews: Review[]
}

// Five stars, filled up to the rating (halves round to the nearest star).
export function Stars({
  value,
  size = 16,
}: {
  value: number
  size?: number
}) {
  const filled = Math.round(value)

  return (
    <span
      className="rex-stars"
      role="img"
      aria-label={`${value.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          aria-hidden="true"
          className={n <= filled ? 'on' : 'off'}
          fill={n <= filled ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  )
}

// Small "★ 4.5 (12)" label for store cards and headers.
export function RatingSummary({
  average,
  count,
}: {
  average?: number
  count?: number
}) {
  if (!count || !average) {
    return <span className="rex-rating-new">New store · no ratings yet</span>
  }

  return (
    <span className="rex-rating-summary">
      <Stars value={average} size={14} />
      <b>{average.toFixed(1)}</b>
      <span>
        ({count} {count === 1 ? 'rating' : 'ratings'})
      </span>
    </span>
  )
}

export default function StoreReviews({
  storeId,
  onChange,
}: {
  storeId: string
  onChange?: (average: number, count: number) => void
}) {
  const { user, ready } = useAuth()

  const [data, setData] = useState<RatingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    try {
      const headers: Record<string, string> = {}

      if (user) {
        headers.Authorization = `Bearer ${await user.getIdToken()}`
      }

      const response = await fetch(
        `/api/store-ratings?storeId=${encodeURIComponent(storeId)}`,
        { headers },
      )

      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.error || 'Unable to load ratings.')
      }

      setData(json as RatingsResponse)
      setLoadError('')

      if (json.myRating) {
        setRating(json.myRating.rating)
        setComment(json.myRating.comment || '')
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to load ratings.',
      )
    } finally {
      setLoading(false)
    }
  }, [storeId, user])

  useEffect(() => {
    if (!ready) return

    void load()
  }, [ready, load])

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!user) return

    if (rating < 1) {
      setFormError('Please choose a star rating.')
      return
    }

    setSaving(true)
    setFormError('')
    setSaved(false)

    try {
      const token = await user.getIdToken()

      const response = await fetch('/api/store-ratings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ storeId, rating, comment }),
      })

      const json = await response.json()

      if (!response.ok) {
        throw new Error(json.error || 'Unable to save your rating.')
      }

      setSaved(true)
      onChange?.(json.average, json.count)
      await load()
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to save your rating.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rex-market-section rex-reviews" id="reviews">
      <div className="rex-market-section-heading">
        <div>
          <span className="rex-market-eyebrow">CUSTOMER RATINGS</span>
          <h2>
            What buyers <em>say.</em>
          </h2>
        </div>

        {data && (
          <RatingSummary average={data.average} count={data.count} />
        )}
      </div>

      {loading && <p className="rex-reviews-note">Loading ratings...</p>}

      {loadError && (
        <p className="rex-ask-error" role="alert">
          {loadError}
        </p>
      )}

      {data && data.canRate && (
        <form className="rex-reviews-form" onSubmit={submit}>
          <strong>
            {data.myRating ? 'Update your rating' : 'Rate this store'}
          </strong>

          <div
            className="rex-reviews-pick"
            role="radiogroup"
            aria-label="Your rating"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                className={n <= rating ? 'on' : ''}
                onClick={() => setRating(n)}
              >
                <Star
                  size={26}
                  aria-hidden="true"
                  fill={n <= rating ? 'currentColor' : 'none'}
                />
              </button>
            ))}
          </div>

          <textarea
            rows={3}
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell other buyers about your experience (optional)"
          />

          {formError && (
            <p className="rex-ask-error" role="alert">
              {formError}
            </p>
          )}

          {saved && (
            <p className="rex-ask-success" role="status">
              Thank you! Your rating has been saved.
            </p>
          )}

          <button
            className="rex-market-primary-link"
            type="submit"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save rating'}
          </button>
        </form>
      )}

      {data && !data.canRate && (
        <p className="rex-reviews-note">
          Only buyers who have received an order from this store can
          rate it.
        </p>
      )}

      {data && data.reviews.length > 0 && (
        <ul className="rex-reviews-list">
          {data.reviews.map((review) => (
            <li key={review.id}>
              <div className="rex-reviews-top">
                <Stars value={review.rating} size={14} />
                <strong>{review.customerName}</strong>

                {review.createdAt > 0 && (
                  <span>
                    {new Date(review.createdAt * 1000).toLocaleDateString(
                      'en-NG',
                      { day: 'numeric', month: 'short', year: 'numeric' },
                    )}
                  </span>
                )}
              </div>

              {review.comment && <p>{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}

      {data && data.reviews.length === 0 && (
        <p className="rex-reviews-note">No ratings yet.</p>
      )}
    </section>
  )
}
