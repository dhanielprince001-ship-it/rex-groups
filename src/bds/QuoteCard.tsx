
import { useState } from 'react'
import type { User } from 'firebase/auth'
import { bdsApi } from './api'
import { fmtDate, naira, toDate, type BdsRequest } from './types'

// Client view of a quote: review, accept or decline, then see payment status.
export default function QuoteCard({ request, user }: { request: BdsRequest; user: User | null }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const quote = request.quote

  if (!quote) return null

  const expiry = toDate(quote.validUntil)
  const expired = !!expiry && expiry.getTime() < Date.now()
  const paid = request.payment?.paid ?? 0

  async function respond(decision: 'accept' | 'decline') {
    if (!user) return
    if (decision === 'accept' && !window.confirm(`Accept this quote of ${naira(quote!.amount)}?`)) return
    setBusy(true)
    setError('')
    try {
      await bdsApi(user, 'respondQuote', { requestId: request.id, decision })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your response.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bds-quote">
      <div className="bds-between">
        <h4>Quote: {naira(quote.amount)}</h4>
        <span className={`bds-status ${quote.status === 'Accepted' ? 'bds-status-approved' : quote.status === 'Declined' ? 'bds-status-rejected' : ''}`}>
          {quote.status === 'Sent' && expired ? 'Expired' : quote.status}
        </span>
      </div>
      <p>{quote.summary}</p>
      {quote.status === 'Sent' && expiry && <small className="bds-muted">{expired ? 'Expired' : 'Valid until'} {fmtDate(quote.validUntil)}</small>}

      {quote.status === 'Sent' && !expired && (
        <div className="bds-row">
          <button className="button button-primary" disabled={busy} onClick={() => void respond('accept')}>Accept quote</button>
          <button className="button bds-ghost bds-danger" disabled={busy} onClick={() => void respond('decline')}>Decline</button>
        </div>
      )}

      {quote.status === 'Accepted' && (
        <>
          <p><strong>Payment:</strong> {request.payment?.status ?? 'Unpaid'} · {naira(paid)} of {naira(quote.amount)} received</p>
          {quote.paymentNote && paid < quote.amount && <p className="bds-muted">How to pay: {quote.paymentNote}</p>}
        </>
      )}
      {error && <p className="bds-error" role="alert">{error}</p>}
    </div>
  )
}
