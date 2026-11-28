
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import { db } from './firebase'
import { useAuth } from './AuthPanel'
import type { BdsRequest } from './bds/types'
import { useStaffRole } from './bds/useStaffRole'
import './admin-alerts.css'

// "Needs attention" bar at the top of the admin dashboard.
export default function AdminAlerts() {
  const { user } = useAuth()
  const { role } = useStaffRole()
  const isAdmin = role === 'admin'

  const [newRequests, setNewRequests] = useState(0)
  const [awaitingReply, setAwaitingReply] = useState(0)
  const [pendingSellers, setPendingSellers] = useState(0)
  const [disputes, setDisputes] = useState(0)
  const [ready, setReady] = useState(false)

  // Digital Solutions requests (live)
  useEffect(() => {
    if (!db || !isAdmin) return
    return onSnapshot(
      collection(db, 'bdsRequests'),
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as BdsRequest)
        setNewRequests(rows.filter((r) => ['Submitted', 'Under review'].includes(r.status)).length)
        setAwaitingReply(
          rows.filter((r) => r.lastMessageRole === 'client' && !['Cancelled', 'Rejected', 'Completed'].includes(r.status)).length,
        )
      },
      () => undefined,
    )
  }, [isAdmin])

  // Seller applications waiting for approval (live)
  useEffect(() => {
    if (!db || !isAdmin) return
    return onSnapshot(
      query(collection(db, 'stores'), where('status', '==', 'Pending')),
      (snap) => setPendingSellers(snap.size),
      () => undefined,
    )
  }, [isAdmin])

  // Disputed marketplace orders (small server summary, refreshed every minute)
  useEffect(() => {
    if (!user || !isAdmin) return

    let cancelled = false

    async function load() {
      try {
        const token = await user!.getIdToken()
        const response = await fetch('/api/admin-marketplace?summary=1', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const data = (await response.json()) as { disputesNeedingReply?: number }
        if (!cancelled && response.ok) setDisputes(Number(data.disputesNeedingReply) || 0)
      } catch {
        // Alerts are a convenience; ignore failures quietly.
      } finally {
        if (!cancelled) setReady(true)
      }
    }

    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 60000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [user, isAdmin])

  if (!isAdmin) return null

  const goTab = (tab: string) => window.dispatchEvent(new CustomEvent('rex-admin-tab', { detail: tab }))
  const total = newRequests + awaitingReply + pendingSellers + disputes

  return (
    <div className="admin-alerts" role="region" aria-label="Needs attention">
      {ready && total === 0 ? (
        <p className="admin-alerts-clear"><CheckCircle2 size={18} aria-hidden="true" /> All caught up. Nothing needs your attention.</p>
      ) : (
        <>
          <strong className="admin-alerts-title"><AlertTriangle size={16} aria-hidden="true" /> Needs attention ({total})</strong>
          <div className="admin-alerts-grid">
            {disputes > 0 && (
              <button type="button" className="admin-alert urgent" onClick={() => goTab('payouts')}>
                <b>{disputes}</b><span>Disputed order{disputes > 1 ? 's' : ''} awaiting your reply</span>
              </button>
            )}
            {pendingSellers > 0 && (
              <button type="button" className="admin-alert" onClick={() => goTab('sellers')}>
                <b>{pendingSellers}</b><span>Seller application{pendingSellers > 1 ? 's' : ''} to review</span>
              </button>
            )}
            {newRequests > 0 && (
              <Link className="admin-alert" to="/business-digital-solutions/admin">
                <b>{newRequests}</b><span>New Digital Solutions request{newRequests > 1 ? 's' : ''}</span>
              </Link>
            )}
            {awaitingReply > 0 && (
              <Link className="admin-alert" to="/business-digital-solutions/admin">
                <b>{awaitingReply}</b><span>Client message{awaitingReply > 1 ? 's' : ''} awaiting reply</span>
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}
