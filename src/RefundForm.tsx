
import { useState, type FormEvent } from 'react'

interface Props {
  total: number
  alreadyRefunded: number
  busy: boolean
  error?: string
  onSubmit: (data: { amount: string; reason: string; viaPaystack: boolean }) => Promise<void>
  onCancel: () => void
}

const money = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 })

// Admin form: refund a buyer in full or in part.
export default function RefundForm({ total, alreadyRefunded, busy, error, onSubmit, onCancel }: Props) {
  const remaining = Math.max(0, total - alreadyRefunded)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [viaPaystack, setViaPaystack] = useState(true)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (reason.trim().length < 5) return
    const label = amount.trim() ? money.format(Number(amount)) : `${money.format(remaining)} (full balance)`
    const how = viaPaystack
      ? 'This will send the money back through Paystack.'
      : 'This only records a refund you already sent yourself. No money is moved.'
    if (!window.confirm(`Refund ${label}? ${how}`)) return
    await onSubmit({ amount: amount.trim(), reason: reason.trim(), viaPaystack })
  }

  return (
    <form className="refund-form" onSubmit={submit}>
      <strong>Refund the buyer</strong>
      <p className="refund-hint">
        Order total {money.format(total)}
        {alreadyRefunded > 0 ? ` · already refunded ${money.format(alreadyRefunded)}` : ''} · can refund up to{' '}
        {money.format(remaining)}. A full refund cancels the seller's payout. A partial refund reduces it by the same amount.
      </p>

      <label>
        Amount (₦), leave empty for the full balance
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
          placeholder={String(remaining)}
        />
      </label>

      <label>
        Reason (the buyer and seller are told this)
        <textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>

      <label className="refund-check">
        <input type="checkbox" checked={viaPaystack} onChange={(e) => setViaPaystack(e.target.checked)} />
        Send the refund through Paystack now
      </label>

      {error && <p className="refund-error" role="alert">{error}</p>}

      <div className="refund-actions">
        <button type="submit" disabled={busy || reason.trim().length < 5 || remaining <= 0}>
          {busy ? 'Working…' : viaPaystack ? 'Refund via Paystack' : 'Record refund'}
        </button>
        <button type="button" onClick={onCancel}>Close</button>
      </div>
    </form>
  )
}
