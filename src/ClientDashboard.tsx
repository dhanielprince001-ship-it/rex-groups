import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { Loader2, Plus, Send } from 'lucide-react'

import { db } from './firebase'
import { useAuth } from './AuthPanel'
import { bdsApi } from './bds/api'
import { SERVICES } from './bds/catalog'
import ServiceRequestForm from './bds/ServiceRequestForm'
import { fmtDate, fmtDateTime, statusClass, toDate, type BdsMessage, type BdsRequest, type BdsUpdate } from './bds/types'
import './bds.css'

type Tab = 'requests' | 'completed' | 'new'

const sortNewest = (a: { updatedAt?: BdsRequest['updatedAt'] }, b: { updatedAt?: BdsRequest['updatedAt'] }) =>
  (toDate(b.updatedAt)?.getTime() ?? 0) - (toDate(a.updatedAt)?.getTime() ?? 0)

export default function ClientDashboard() {
  const { user, ready } = useAuth()
  const [requests, setRequests] = useState<BdsRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState<Tab>('requests')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!db || !user) { setLoading(false); return }
    return onSnapshot(
      query(collection(db, 'bdsRequests'), where('clientId', '==', user.uid)),
      (snap) => {
        setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BdsRequest).sort(sortNewest))
        setLoading(false)
      },
      () => { setLoadError('Could not load your requests.'); setLoading(false) },
    )
  }, [user])

  const active = useMemo(() => requests.filter((r) => r.status !== 'Completed'), [requests])
  const completed = useMemo(() => requests.filter((r) => r.status === 'Completed'), [requests])
  const list = tab === 'completed' ? completed : active
  const selected = requests.find((r) => r.id === selectedId) ?? null

  if (!ready) return <section className="section-wrap section-block bds"><p className="bds-muted">Loading…</p></section>

  if (!user) {
    return (
      <section className="section-wrap section-block bds">
        <div className="section-kicker">CLIENT DASHBOARD</div>
        <div className="bds-panel bds-center">
          <h2>Sign in to view your projects</h2>
          <p className="bds-muted">Register or sign in to submit requests, track progress and message Rex Groups.</p>
          <Link className="button button-primary" to="/#account">Sign in / Register</Link>
        </div>
      </section>
    )
  }

  return (
    <section className="section-wrap section-block bds">
      <div className="section-kicker">CLIENT DASHBOARD</div>
      <div className="section-heading"><h2>Welcome, <em>{user.displayName?.split(' ')[0] || 'client'}.</em></h2></div>

      <div className="bds-stats">
        <div><span>Active</span><strong>{active.filter((r) => ['Approved', 'In progress'].includes(r.status)).length}</strong></div>
        <div><span>Awaiting review</span><strong>{requests.filter((r) => ['Submitted', 'Under review'].includes(r.status)).length}</strong></div>
        <div><span>Completed</span><strong>{completed.length}</strong></div>
      </div>

      <div className="bds-tabs">
        <button className={tab === 'requests' ? 'on' : ''} onClick={() => { setTab('requests'); setSelectedId(null) }}>My requests ({active.length})</button>
        <button className={tab === 'completed' ? 'on' : ''} onClick={() => { setTab('completed'); setSelectedId(null) }}>Completed ({completed.length})</button>
        <button className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}><Plus size={14} aria-hidden="true" /> New request</button>
      </div>

      {tab === 'new' ? (
        <ServiceRequestForm onSubmitted={() => setTab('requests')} />
      ) : loading ? (
        <p className="bds-muted"><Loader2 size={16} className="bds-spin" /> Loading your requests…</p>
      ) : loadError ? (
        <p className="bds-error" role="alert">{loadError}</p>
      ) : (
        <div className="bds-split">
          <div className="bds-list">
            {list.length === 0 && (
              <div className="bds-panel bds-center">
                <p className="bds-muted">{tab === 'completed' ? 'No completed projects yet.' : 'You have no requests yet.'}</p>
                {tab !== 'completed' && <button className="button button-primary" onClick={() => setTab('new')}>Submit your first request</button>}
              </div>
            )}
            {list.map((r) => (
              <button key={r.id} className={`bds-item ${r.id === selectedId ? 'on' : ''}`} onClick={() => setSelectedId(r.id)}>
                <strong>{r.title}</strong>
                <span className={statusClass(r.status)}>{r.status}</span>
                <div className="bds-progress"><i style={{ width: `${r.progress}%` }} /></div>
                <small>{fmtDate(r.createdAt)}</small>
              </button>
            ))}
          </div>
          {selected ? <RequestDetail key={selected.id} request={selected} /> : <div className="bds-panel bds-center bds-muted">Select a request to see updates and messages.</div>}
        </div>
      )}
    </section>
  )
}

function RequestDetail({ request }: { request: BdsRequest }) {
  const { user } = useAuth()
  const [updates, setUpdates] = useState<BdsUpdate[]>([])
  const [messages, setMessages] = useState<BdsMessage[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!db) return
    const base = doc(db, 'bdsRequests', request.id)
    const byTime = (a: { createdAt?: BdsRequest['createdAt'] }, b: { createdAt?: BdsRequest['createdAt'] }) =>
      (toDate(a.createdAt)?.getTime() ?? Date.now()) - (toDate(b.createdAt)?.getTime() ?? Date.now())
    const u1 = onSnapshot(collection(base, 'updates'), (s) => setUpdates(s.docs.map((d) => ({ id: d.id, ...d.data() }) as BdsUpdate).sort((a, b) => byTime(b, a))), () => undefined)
    const u2 = onSnapshot(collection(base, 'messages'), (s) => setMessages(s.docs.map((d) => ({ id: d.id, ...d.data() }) as BdsMessage).sort(byTime)), () => undefined)
    return () => { u1(); u2() }
  }, [request.id])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!user || !text.trim() || busy) return
    setBusy(true); setError('')
    try {
      await bdsApi(user, 'sendMessage', { requestId: request.id, text })
      setText('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send.') } finally { setBusy(false) }
  }

  async function cancel() {
    if (!user || !window.confirm('Cancel this request?')) return
    setBusy(true); setError('')
    try { await bdsApi(user, 'cancelRequest', { requestId: request.id }) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel.') } finally { setBusy(false) }
  }

  const names = request.services.map((id) => SERVICES.find((s) => s.id === id)?.title ?? id)

  return (
    <div className="bds-panel bds-detail-pane">
      <div className="bds-between">
        <h3>{request.title}</h3>
        <span className={statusClass(request.status)}>{request.status}</span>
      </div>
      <p className="bds-muted">{names.join(' · ')}</p>
      <p>{request.description}</p>
      <div className="bds-meta">
        <span>Budget: {request.budget}</span><span>Timeline: {request.timeline}</span>
        <span>Assigned: {request.assignee || 'Pending'}</span><span>Submitted: {fmtDate(request.createdAt)}</span>
      </div>
      {request.status === 'Rejected' && request.adminNote && <p className="bds-error">Reason: {request.adminNote}</p>}

      <label className="bds-muted">Progress: {request.progress}%</label>
      <div className="bds-progress big"><i style={{ width: `${request.progress}%` }} /></div>

      <h4>Updates</h4>
      <ol className="bds-timeline">
        {updates.map((u) => (
          <li key={u.id}><small>{fmtDateTime(u.createdAt)}{typeof u.progress === 'number' ? ` · ${u.progress}%` : ''}</small><p>{u.text}</p></li>
        ))}
      </ol>

      <h4>Messages</h4>
      <div className="bds-thread">
        {messages.length === 0 && <p className="bds-muted">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`bds-msg ${m.role}`}><small>{m.role === 'admin' ? 'Rex Groups' : 'You'} · {fmtDateTime(m.createdAt)}</small><p>{m.text}</p></div>
        ))}
      </div>

      {request.status !== 'Cancelled' && (
        <form className="bds-compose" onSubmit={send}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Write a message…" aria-label="Message" />
          <button className="button button-primary" disabled={busy || !text.trim()} type="submit"><Send size={15} aria-hidden="true" />Send</button>
        </form>
      )}
      {error && <p className="bds-error" role="alert">{error}</p>}
      {['Submitted', 'Under review'].includes(request.status) && <button className="button bds-ghost bds-danger" disabled={busy} onClick={cancel}>Cancel request</button>}
    </div>
  )
}
