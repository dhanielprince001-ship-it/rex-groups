
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../AuthPanel'
import DisputeThread from '../DisputeThread'
import { naira } from './types'

interface DisputeRow {
  id: string
  storeName: string
  customerName: string
  total: number
  disputeReason: string
  disputeLastRole: string
  disputedAt?: { seconds?: number } | null
}

// Disputed marketplace orders. Staff can read and reply, but cannot move money.
export default function DisputesPanel() {
  const { user } = useAuth()
  const [rows, setRows] = useState<DisputeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const load = useCallback(async () => {
    if (!user) return
    try {
      const token = await user.getIdToken()
      const response = await fetch('/api/admin-marketplace?disputes=1', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const data = (await response.json().catch(() => ({}))) as { orders?: DisputeRow[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Could not load disputes.')
      setRows(Array.isArray(data.orders) ? data.orders : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load disputes.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 30000)
    return () => window.clearInterval(timer)
  }, [load])

  const selected = rows.find((r) => r.id === selectedId)

  return (
    <div className="bds-split">
      <div className="bds-list">
        {loading && <div className="bds-panel bds-muted">Loading…</div>}
        {!loading && rows.length === 0 && !error && <div className="bds-panel bds-center bds-muted">No open disputes.</div>}
        {error && <p className="bds-error" role="alert">{error}</p>}
        {rows.map((r) => (
          <button key={r.id} className={`bds-item ${r.id === selectedId ? 'on' : ''}`} onClick={() => setSelectedId(r.id)}>
            <strong>{r.storeName || 'Store'} · {naira(r.total)}</strong>
            <small>{r.customerName || 'Buyer'}{r.disputeLastRole !== 'admin' ? ' · ● needs a reply' : ''}</small>
          </button>
        ))}
      </div>

      {selected ? (
        <div className="bds-panel bds-detail-pane">
          <h3>{selected.storeName || 'Store'} · {naira(selected.total)}</h3>
          <p className="bds-muted">Buyer: {selected.customerName || '—'}</p>
          <p><strong>Reported problem:</strong> {selected.disputeReason || '—'}</p>
          <p className="bds-muted">
            Staff can talk to the buyer and seller here. Refunds and seller payouts are handled by the owner.
          </p>
          <DisputeThread
            key={selected.id}
            user={user}
            orderId={selected.id}
            viewer="admin"
            url="/api/admin-marketplace"
            sendMethod="PATCH"
            sendExtra={{ action: 'dispute-message' }}
          />
        </div>
      ) : (
        <div className="bds-panel bds-center bds-muted">Select a dispute.</div>
      )}
    </div>
  )
}
