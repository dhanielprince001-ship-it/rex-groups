import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'

import { useAuth } from './AuthPanel'

type Bank = { name: string; code: string }

type Verification = {
  status: string
  legalName: string
  bankName: string
  accountMasked: string
  accountName: string
  nameChecked: boolean
  rejectionReason: string
}

// Seller identity check: the bank account must belong to the seller.
export default function SellerVerification() {
  const { user } = useAuth()

  const [verification, setVerification] = useState<Verification | null>(null)
  const [loading, setLoading] = useState(true)
  const [banks, setBanks] = useState<Bank[]>([])
  const [editing, setEditing] = useState(false)

  const [legalName, setLegalName] = useState('')
  const [phone, setPhone] = useState('')
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [businessRegNumber, setBusinessRegNumber] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!user) throw new Error('Please sign in again.')

      const token = await user.getIdToken()

      const response = await fetch(path, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        },
        cache: 'no-store',
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data.error || 'The request could not be completed.')
      }

      return data
    },
    [user],
  )

  const load = useCallback(async () => {
    try {
      const data = await call('/api/seller-verification')

      setVerification(data.verification as Verification | null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load your verification.',
      )
    } finally {
      setLoading(false)
    }
  }, [call])

  useEffect(() => {
    void load()
  }, [load])

  async function openForm() {
    setEditing(true)
    setError('')

    if (banks.length === 0) {
      try {
        const data = await call('/api/seller-verification?banks=1')

        setBanks(data.banks as Bank[])
      } catch {
        // The form still works if the list cannot load; the error shows on submit.
      }
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    setSaving(true)
    setError('')

    try {
      const bank = banks.find((entry) => entry.code === bankCode)

      await call('/api/seller-verification', {
        method: 'POST',
        body: JSON.stringify({
          legalName,
          phone,
          bankCode,
          bankName: bank?.name || '',
          accountNumber,
          businessRegNumber,
        }),
      })

      setEditing(false)
      setAccountNumber('')
      await load()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to submit your details.',
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  const status = verification?.status

  return (
    <div className="seller-verify">
      <div className="seller-verify-head">
        <ShieldCheck size={22} aria-hidden="true" />

        <div>
          <span className="marketplace-eyebrow">TRUST</span>
          <h3>Seller verification</h3>
        </div>
      </div>

      {status === 'Verified' && (
        <p className="seller-verify-ok">
          Your store is verified. Buyers see a &ldquo;Verified seller&rdquo;
          badge. Payouts go to {verification?.bankName}{' '}
          {verification?.accountMasked}.
        </p>
      )}

      {status === 'Pending Review' && !editing && (
        <p>
          Your details are with Rex Groups for review. Payouts will go to{' '}
          {verification?.bankName} {verification?.accountMasked}
          {verification?.nameChecked
            ? ` (${verification.accountName}).`
            : '.'}
        </p>
      )}

      {status === 'Rejected' && !editing && (
        <p className="marketplace-error" role="alert">
          Your verification was not approved
          {verification?.rejectionReason
            ? `: ${verification.rejectionReason}`
            : '.'}{' '}
          You can correct your details and submit again.
        </p>
      )}

      {!status && !editing && (
        <p>
          Verified stores get a badge that buyers trust, and you are paid
          straight to your own bank account. Submit your legal name and
          the bank account you want to be paid into. The account name must
          match your name.
        </p>
      )}

      {error && (
        <p className="marketplace-error" role="alert">
          {error}
        </p>
      )}

      {!editing && status !== 'Verified' && (
        <button
          type="button"
          className="marketplace-button"
          onClick={() => void openForm()}
        >
          {status ? 'Update my details' : 'Verify my store'}
        </button>
      )}

      {editing && (
        <form className="seller-verify-form" onSubmit={submit}>
          <label>
            <span>Full legal name (same as your bank account)</span>
            <input
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              maxLength={100}
              required
            />
          </label>

          <label>
            <span>Phone number</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </label>

          <label>
            <span>Bank</span>
            <select
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              required
            >
              <option value="">Choose your bank</option>

              {banks.map((bank) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Account number (10 digits)</span>
            <input
              inputMode="numeric"
              pattern="[0-9]{10}"
              maxLength={10}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              required
            />
          </label>

          <label>
            <span>Business registration number (optional)</span>
            <input
              value={businessRegNumber}
              onChange={(e) => setBusinessRegNumber(e.target.value)}
              maxLength={40}
            />
          </label>

          <div className="seller-delivery-actions">
            <button
              type="submit"
              className="marketplace-button"
              disabled={saving}
            >
              {saving ? 'Checking...' : 'Submit for verification'}
            </button>

            <button
              type="button"
              className="marketplace-button"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
