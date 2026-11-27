
import { useState } from 'react'
import type { User } from 'firebase/auth'
import { bdsApi } from './api'
import { fmtDate, naira, type BdsRequest } from './types'

const METHODS = ['Bank transfer', 'Cash', 'Paystack link', 'Other']

// Admin tools: send a quote, then record payments against it.
export default function AdminQuotePanel({ request, user }: { request: BdsRequest; user: User | null }) {
  const quote = request.quote
  const [amount, setAmount] = useState(quote ? String(quote.amount) : '')
  const [summary, setSummary] = useState(quote?.summary ?? '')
  const [paymentNote, setPaymentNote] = useState(quote?.paymentNote ?? '')
  const [validDays, setValidDays] = useState('14')
  const [payAmount, setPayAmount] = useState('')
  const [method, setMethod] = useState(METHODS[0])
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const closed = ['Rejected', 'Cancelled', 'Completed'].includes(request.status)
  const accepted = quote?.status === 'Accepted'
  const paid = request.payment?.paid ?? 0

  async function run(key: string, action: string, payload: Record<string, unknown>, success: string) {
    if (!user) return
    setBusy(key)
    setError('')
    setOk('')
    try {
      await bdsApi(user, action, { requestId: request.id, ...payload })
      setOk(success)
      if (key === 'pay') { setPayAmount(''); setReference('') }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <h4>Quote and payment</h4>

      {quote && (
        <p className="bds-muted">
          Current quote: {naira(quote.amount)} · {quote.status} · valid until {fmtDate(quote.validUntil)}
          {accepted && ` · paid ${naira(paid)} (${request.payment?.status ?? 'Unpaid'})`}
        </p>
      )}

      {!accepted && !closed && (
        <div className="bds-grid2">
          <label>Amount (₦)
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 250000" />
          </label>
          <label>Valid for (days)
            <input inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>What the price covers
            <textarea rows={3} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>How to pay (shown after they accept)
            <textarea rows={2} maxLength={500} value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Bank name, account number, account name, reference to use" />
          </label>
          <button className="button button-primary" disabled={!!busy || !amount || summary.trim().length < 10}
            onClick={() => void run('quote', 'sendQuote', { amount: Number(amount), summary, paymentNote, validDays: Number(validDays) || 14 }, 'Quote sent to the client.')}>
            {busy === 'quote' ? 'Sending…' : quote ? 'Send new quote' : 'Send quote'}
          </button>
        </div>
      )}

      {accepted && paid < (quote?.amount ?? 0) && (
        <div className="bds-grid2">
          <label>Payment received (₦)
            <input inputMode="numeric" value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/\D/g, ''))} />
          </label>
          <label>Method
            <select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
          <label style={{ gridColumn: '1 / -1' }}>Reference (optional)
            <input maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
          <button className="button button-primary" disabled={!!busy || !payAmount}
            onClick={() => void run('pay', 'recordPayment', { amount: Number(payAmount), method, reference }, 'Payment recorded.')}>
            {busy === 'pay' ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      )}

      {accepted && paid >= (quote?.amount ?? 0) && <p className="bds-ok">Paid in full.</p>}
      {ok && <p className="bds-ok" role="status">{ok}</p>}
      {error && <p className="bds-error" role="alert">{error}</p>}
    </div>
  )
}
