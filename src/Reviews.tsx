import { useEffect, useState, type FormEvent } from 'react'
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from './firebase'
import { Star, MessageSquare, Send } from 'lucide-react'

type Review = {
  id: string
  name: string
  rating: number
  comment: string
  adminReply?: string
}

export default function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!db) return

    const reviewsQuery = query(
      collection(db, 'reviews'),
      where('status', '==', 'Approved'),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(
      reviewsQuery,
      (snapshot) => {
        const approvedReviews: Review[] = snapshot.docs.map((item) => {
          const data = item.data()

          return {
            id: item.id,
            name: data.name || 'Customer',
            rating: Number(data.rating) || 5,
            comment: data.comment || '',
            adminReply: data.adminReply || '',
          }
        })

        setReviews(approvedReviews)
      },
      (error) => {
        console.error('Could not load reviews:', error)
      }
    )

    return unsubscribe
  }, [])

  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!db) {
      setMessage('Reviews are temporarily unavailable. Please try again later.')
      return
    }

    if (!name.trim() || !email.trim() || !comment.trim()) {
      setMessage('Please complete all fields.')
      return
    }

    if (comment.trim().length < 10) {
      setMessage('Please write a little more about your experience.')
      return
    }

    try {
      setLoading(true)
      setMessage('')

      await addDoc(collection(db, 'reviews'), {
        name: name.trim(),
        email: email.trim(),
        rating,
        comment: comment.trim(),
        status: 'Pending',
        createdAt: serverTimestamp(),
      })

      setName('')
      setEmail('')
      setRating(5)
      setComment('')

      setMessage('Thank you! Your review has been submitted for approval.')
    } catch (error) {
      console.error('Review submission failed:', error)
      setMessage('Your review could not be submitted. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="reviews-section" id="reviews">
      <div className="reviews-heading">
        <span className="section-label">CUSTOMER FEEDBACK</span>

        <h2>What Our Customers Say</h2>

        <p>
          Your experience matters to us. Read customer feedback or share your
          experience with Rex Groups.
        </p>
      </div>

      <div className="reviews-grid">
        <div className="reviews-list">
          {reviews.length === 0 ? (
            <div className="review-empty">
              <MessageSquare size={30} />
              <h3>Be the first to share your experience</h3>
              <p>Approved customer reviews will appear here.</p>
            </div>
          ) : (
            reviews.map((review) => (
              <article className="review-card" key={review.id}>
                <div
                  className="review-stars"
                  aria-label={`${review.rating} out of 5 stars`}
                >
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star
                      key={index}
                      size={17}
                      fill={index < review.rating ? 'currentColor' : 'none'}
                    />
                  ))}
                </div>

                <p className="review-comment">
                  “{review.comment}”
                </p>

                <h4>{review.name}</h4>

                {review.adminReply && (
                  <div className="review-company-reply">
                    <div className="review-company-reply-heading">
                      <MessageSquare size={16} />
                      <strong>Rex Groups response</strong>
                    </div>

                    <p>{review.adminReply}</p>
                  </div>
                )}
              </article>
            ))
          )}
        </div>

        <form className="review-form" onSubmit={submitReview}>
          <h3>Share Your Experience</h3>

          <p>
            Your review will be checked by our team before it appears publicly.
          </p>

          <label htmlFor="review-name">Your name</label>

          <input
            id="review-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter your name"
            maxLength={80}
            required
          />

          <label htmlFor="review-email">Email address</label>

          <input
            id="review-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter your email"
            maxLength={120}
            required
          />

          <label>Your rating</label>

          <div className="rating-picker" aria-label="Choose a rating">
            {Array.from({ length: 5 }, (_, index) => {
              const value = index + 1

              return (
                <button
                  type="button"
                  key={value}
                  className={value <= rating ? 'rating-star active' : 'rating-star'}
                  onClick={() => setRating(value)}
                  aria-label={`${value} star${value === 1 ? '' : 's'}`}
                  aria-pressed={rating === value}
                >
                  <Star
                    size={25}
                    fill={value <= rating ? 'currentColor' : 'none'}
                  />
                </button>
              )
            })}
          </div>

          <label htmlFor="review-comment">Your review</label>

          <textarea
            id="review-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Tell us about your experience..."
            rows={5}
            maxLength={1000}
            required
          />

          {message && (
            <p className="review-message" role="status">
              {message}
            </p>
          )}

          <button
            className="review-submit"
            type="submit"
            disabled={loading}
          >
            <Send size={17} />
            {loading ? 'Submitting...' : 'Submit Review'}
          </button>
        </form>
      </div>
    </section>
  )
}
