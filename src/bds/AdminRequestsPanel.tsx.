import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { ArrowUpRight } from 'lucide-react'

import { db } from '../firebase'
import { useAuth } from '../AuthPanel'
import { ADMIN_UID, fmtDate, statusClass, toDate, type BdsRequest } from './types'
import '../bds.css'

// Shows the latest Business Digital Solutions requests inside the main admin dashboard.
export default function AdminRequestsPanel() {
  const { user } = useAuth()
  const isAdmin = user?.uid === ADMIN_UID
  const [rows, setRows] = useState<BdsRequest[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!db || !isAdmin) return
    return onSnapshot(
      collection(db, 'bdsRequests'),
      (snap) => {
        setError('')
        setRows(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as BdsRequest)
            .sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0)),
        )
      },
      () => setError('Could not load service requests. Check that the Firestore rules were published.'),
    )
  }, [isAdmin])

  if (!isAdmin) return null

  const waiting = rows.filter((r) => ['Submitted', 'Under review'].includes(r.status)).length

  return (
    <div className="bds-panel bds" style={{ marginBottom: 24 }}>
      <div className="bds-between">
        <h3>Digital Solutions requests ({waiting} awaiting review)</h3>
        <Link className="text-link" to="/business-digital-solutions/admin">
          Manage all <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </div>
      {error && <p className="bds-error" role="alert">{error}</p>}
      {!error && rows.length === 0 && <p className="bds-muted">No service requests yet.</p>}
      <div className="bds-list">
        {rows.slice(0, 5).map((r) => (
          <Link key={r.id} className="bds-item" to="/business-digital-solutions/admin">
            <strong>{r.title}</strong>
            <span className={statusClass(r.status)}>{r.status}</span>
            <small>{r.clientName} · {r.clientEmail} · {fmtDate(r.createdAt)}</small>
          </Link>
        ))}
      </div>
    </div>
  )
}
