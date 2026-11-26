import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { Download, Loader2, Search, Send } from 'lucide-react'

import { db } from './firebase'
import { useAuth } from './AuthPanel'
import { bdsApi } from './bds/api'
import { SERVICES } from './bds/catalog'
import { BarChart, BarLegend, LineChart } from './bds/charts'
import {
  ADMIN_UID, STATUSES, fmtDate, fmtDateTime, statusClass, toDate,
  type BdsActivity, type BdsClientRecord, type BdsMessage, type BdsRequest, type BdsServiceOverride, type BdsUpdate, type RequestStatus, type ServiceId,
} from './bds/types'
import './bds.css'

type Tab = 'requests' | 'clients' | 'services' | 'analytics' | 'activity'
interface Profile { id: string; name?: string; email?: string; phone?: string }

const time = (r: BdsRequest) => toDate(r.updatedAt)?.getTime() ?? 0

function useCollection<T>(name: string, enabled: boolean, extra: ReturnType<typeof limit>[] = []) {
  const [rows, setRows] = useState<T[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!db || !enabled) return
    return onSnapshot(
      query(collection(db, name), ...extra),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
      () => setError(`Could not load ${name}.`),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, enabled])
  return { rows, error }
}

export default function AdminBdsDashboard() {
  const { user, ready } = useAuth()
  const isAdmin = user?.uid === ADMIN_UID
  const [tab, setTab] = useState<Tab>('requests')

  const reqs = useCollection<BdsRequest>('bdsRequests', isAdmin)
  const profiles = useCollection<Profile>('profiles', isAdmin)
  const clientRecs = useCollection<BdsClientRecord>('bdsClients', isAdmin)
  const svcs = useCollection<BdsServiceOverride>('bdsServices', isAdmin)
  const [activity, setActivity] = useState<BdsActivity[]>([])

  useEffect(() => {
    if (!db || !isAdmin) return
    return onSnapshot(query(collection(db, 'bdsActivity'), orderBy('createdAt', 'desc'), limit(60)),
      (s) => setActivity(s.docs.map((d) => ({ id: d.id, ...d.data() }) as BdsActivity)), () => undefined)
  }, [isAdmin])

  const requests = useMemo(() => [...reqs.rows].sort((a, b) => time(b) - time(a)), [reqs.rows])

  if (!ready) return <section className="section-wrap section-block bds"><p className="bds-muted">Loading…</p></section>
  if (!isAdmin) {
    return (
      <section className="section-wrap section-block bds">
        <div className="bds-panel bds-center">
          <h2>Administrator access only</h2>
          <p className="bds-muted">{user ? 'This account is not authorised.' : 'Sign in with the administrator account.'}</p>
          <Link className="button button-primary" to={user ? '/business-digital-solutions' : '/#account'}>{user ? 'Back' : 'Sign in'}</Link>
        </div>
      </section>
    )
  }

  const awaiting = requests.filter((r) => ['Submitted', 'Under review'].includes(r.status)).length
  const tabs: [Tab, string][] = [['requests', `Requests (${awaiting} new)`], ['clients', 'Clients'], ['services', 'Services'], ['analytics', 'Analytics'], ['activity', 'Activity']]

  return (
    <section className="section-wrap section-block bds">
      <div className="section-kicker">ADMIN · BUSINESS DIGITAL SOLUTIONS</div>
      <div className="section-heading"><h2>Projects <em>control room.</em></h2></div>
      <div className="bds-tabs">{tabs.map(([k, label]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}</div>
      {reqs.error && <p className="bds-error" role="alert">{reqs.error}</p>}

      {tab === 'requests' && <RequestsTab requests={requests} />}
      {tab === 'clients' && <ClientsTab requests={requests} profiles={profiles.rows} records={clientRecs.rows} />}
      {tab === 'services' && <ServicesTab overrides={svcs.rows} />}
      {tab === 'analytics' && <AnalyticsTab requests={requests} />}
      {tab === 'activity' && (
        <div className="bds-panel">
          <ul className="bds-activity">
            {activity.length === 0 && <li className="bds-muted">No activity yet.</li>}
            {activity.map((a) => <li key={a.id}><small>{fmtDateTime(a.createdAt)} · {a.actorRole}</small><span>{a.summary}</span></li>)}
          </ul>
        </div>
      )}
    </section>
  )
}

function RequestsTab({ requests }: { requests: BdsRequest[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'All' | RequestStatus>('All')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const shown = requests.filter((r) =>
    (filter === 'All' || r.status === filter) &&
    `${r.title} ${r.clientName} ${r.clientEmail} ${r.company}`.toLowerCase().includes(search.trim().toLowerCase()))
  const selected = requests.find((r) => r.id === selectedId) ?? null

  return (
    <>
      <div className="bds-toolbar">
        <label className="bds-search"><Search size={15} aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, client, company" aria-label="Search requests" /></label>
        <select value={filter} onChange={(e) => setFilter(e.target.value as 'All' | RequestStatus)} aria-label="Filter by status">
          <option>All</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="bds-split">
        <div className="bds-list">
          {shown.length === 0 && <div className="bds-panel bds-center bds-muted">No requests match.</div>}
          {shown.map((r) => (
            <button key={r.id} className={`bds-item ${r.id === selectedId ? 'on' : ''}`} onClick={() => setSelectedId(r.id)}>
              <strong>{r.title}</strong>
              <span className={statusClass(r.status)}>{r.status}</span>
              <small>{r.clientName} · {fmtDate(r.createdAt)}{r.lastMessageRole === 'client' ? ' · ● awaiting reply' : ''}</small>
            </button>
          ))}
        </div>
        {selected ? <AdminDetail key={selected.id} request={selected} /> : <div className="bds-panel bds-center bds-muted">Select a request.</div>}
      </div>
    </>
  )
}

function AdminDetail({ request }: { request: BdsRequest }) {
  const { user } = useAuth()
  const [updates, setUpdates] = useState<BdsUpdate[]>([])
  const [messages, setMessages] = useState<BdsMessage[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [note, setNote] = useState('')
  const [assignee, setAssignee] = useState(request.assignee)
  const [updateText, setUpdateText] = useState('')
  const [progress, setProgress] = useState(request.progress)
  const [reply, setReply] = useState('')

  useEffect(() => {
    if (!db) return
    const base = doc(db, 'bdsRequests', request.id)
    const asc = (a: { createdAt?: BdsRequest['createdAt'] }, b: { createdAt?: BdsRequest['createdAt'] }) => (toDate(a.createdAt)?.getTime() ?? Date.now()) - (toDate(b.createdAt)?.getTime() ?? Date.now())
    const a = onSnapshot(collection(base, 'updates'), (s) => setUpdates(s.docs.map((d) => ({ id: d.id, ...d.data() }) as BdsUpdate).sort((x, y) => asc(y, x))), () => undefined)
    const b = onSnapshot(collection(base, 'messages'), (s) => setMessages(s.docs.map((d) => ({ id: d.id, ...d.data() }) as BdsMessage).sort(asc)), () => undefined)
    return () => { a(); b() }
  }, [request.id])

  async function run(key: string, action: string, payload: Record<string, unknown>, success: string, after?: () => void) {
    if (!user) return
    setBusy(key); setError(''); setOk('')
    try { await bdsApi(user, action, { requestId: request.id, ...payload }); setOk(success); after?.() }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed.') } finally { setBusy('') }
  }

  const setStatus = (status: RequestStatus) => {
    if (status === 'Rejected' && note.trim().length < 5) return setError('Add a rejection reason (at least 5 characters) in the note box first.')
    void run('status', 'setStatus', { status, note }, `Status set to ${status}.`, () => setNote(''))
  }

  const sendReply = (e: FormEvent) => { e.preventDefault(); if (reply.trim()) void run('msg', 'sendMessage', { text: reply }, 'Message sent.', () => setReply('')) }

  return (
    <div className="bds-panel bds-detail-pane">
      <div className="bds-between"><h3>{request.title}</h3><span className={statusClass(request.status)}>{request.status}</span></div>
      <p className="bds-muted">{request.clientName} · {request.clientEmail}{request.phone ? ` · ${request.phone}` : ''}{request.company ? ` · ${request.company}` : ''}</p>
      <p className="bds-muted">{request.services.map((id) => SERVICES.find((s) => s.id === id)?.title ?? id).join(' · ')}</p>
      <p>{request.description}</p>
      <div className="bds-meta"><span>Budget: {request.budget}</span><span>Timeline: {request.timeline}</span><span>Contact via: {request.contactMethod}</span></div>

      <h4>Decision</h4>
      <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to client (required when rejecting)" aria-label="Status note" />
      <div className="bds-row">
        <button className="button button-primary" disabled={!!busy || request.status === 'Approved'} onClick={() => setStatus('Approved')}>Approve</button>
        <button className="button bds-ghost bds-danger" disabled={!!busy || request.status === 'Rejected'} onClick={() => setStatus('Rejected')}>Reject</button>
        <select value={request.status} disabled={!!busy} onChange={(e) => setStatus(e.target.value as RequestStatus)} aria-label="Set status">
          {STATUSES.filter((s) => s !== 'Cancelled' || request.status === 'Cancelled').map((s) => <option key={s} disabled={s === 'Cancelled'}>{s}</option>)}
        </select>
      </div>

      <h4>Assignment</h4>
      <div className="bds-row">
        <input value={assignee} onChange={(e) => setAssignee(e.target.value)} maxLength={80} placeholder="Assign to (team member)" aria-label="Assignee" />
        <button className="button bds-ghost" disabled={!!busy} onClick={() => void run('assign', 'assign', { assignee }, 'Assignment saved.')}>Save</button>
      </div>

      <h4>Progress update</h4>
      <label className="bds-muted">Progress: {progress}%<input type="range" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(Number(e.target.value))} /></label>
      <textarea rows={2} maxLength={1000} value={updateText} onChange={(e) => setUpdateText(e.target.value)} placeholder="What has been done? Visible to the client." aria-label="Progress update text" />
      <button className="button button-primary" disabled={!!busy || updateText.trim().length < 3} onClick={() => void run('upd', 'addUpdate', { text: updateText, progress }, 'Update posted.', () => setUpdateText(''))}>Post update</button>

      <ol className="bds-timeline">{updates.map((u) => <li key={u.id}><small>{fmtDateTime(u.createdAt)}{typeof u.progress === 'number' ? ` · ${u.progress}%` : ''}</small><p>{u.text}</p></li>)}</ol>

      <h4>Conversation</h4>
      <div className="bds-thread">
        {messages.length === 0 && <p className="bds-muted">No messages yet.</p>}
        {messages.map((m) => <div key={m.id} className={`bds-msg ${m.role}`}><small>{m.authorName} · {fmtDateTime(m.createdAt)}</small><p>{m.text}</p></div>)}
      </div>
      <form className="bds-compose" onSubmit={sendReply}>
        <textarea rows={2} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to client…" aria-label="Reply" />
        <button className="button button-primary" disabled={!!busy || !reply.trim()} type="submit"><Send size={15} aria-hidden="true" />Send</button>
      </form>

      {busy && <p className="bds-muted"><Loader2 size={14} className="bds-spin" /> Working…</p>}
      {ok && <p className="bds-ok" role="status">{ok}</p>}
      {error && <p className="bds-error" role="alert">{error}</p>}
    </div>
  )
}

function ClientsTab({ requests, profiles, records }: { requests: BdsRequest[]; profiles: Profile[]; records: BdsClientRecord[] }) {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const rows = profiles
    .filter((p) => p.id !== ADMIN_UID && `${p.name} ${p.email}`.toLowerCase().includes(search.toLowerCase()))
    .map((p) => ({ p, count: requests.filter((r) => r.clientId === p.id).length, rec: records.find((r) => r.id === p.id) }))
    .sort((a, b) => b.count - a.count)

  async function save(id: string) {
    if (!user) return
    setBusy(true); setError('')
    try { await bdsApi(user, 'saveClient', { clientId: id, note, blocked }); setEditing(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
  }

  return (
    <div className="bds-panel">
      <label className="bds-search"><Search size={15} aria-hidden="true" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients" aria-label="Search clients" /></label>
      {error && <p className="bds-error" role="alert">{error}</p>}
      <div className="bds-table-wrap">
        <table className="bds-table">
          <thead><tr><th>Client</th><th>Email</th><th>Requests</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map(({ p, count, rec }) => (
              <tr key={p.id}>
                <td>{p.name || '—'}</td><td>{p.email || '—'}</td><td>{count}</td>
                <td>{rec?.blocked ? <span className="bds-status bds-status-rejected">Blocked</span> : 'Active'}</td>
                <td><button className="text-link bds-linkbtn" onClick={() => { setEditing(p.id); setNote(rec?.note ?? ''); setBlocked(!!rec?.blocked) }}>Manage</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="bds-edit">
          <h4>Client note</h4>
          <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Client note" />
          <label className="bds-check"><input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} /> Block new requests from this client</label>
          <div className="bds-row">
            <button className="button button-primary" disabled={busy} onClick={() => void save(editing)}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="button bds-ghost" onClick={() => setEditing(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ServicesTab({ overrides }: { overrides: BdsServiceOverride[] }) {
  return (
    <div className="bds-list">
      {SERVICES.map((s) => <ServiceRow key={s.id} id={s.id} title={s.title} base={s.tagline} override={overrides.find((o) => o.id === s.id)} />)}
    </div>
  )
}

function ServiceRow({ id, title, base, override }: { id: ServiceId; title: string; base: string; override?: BdsServiceOverride }) {
  const { user } = useAuth()
  const [active, setActive] = useState(override?.active !== false)
  const [tagline, setTagline] = useState(override?.tagline ?? '')
  const [priceNote, setPriceNote] = useState(override?.priceNote ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    if (!user) return
    setBusy(true); setMsg('')
    try { await bdsApi(user, 'saveService', { id, active, tagline, priceNote }); setMsg('Saved.') }
    catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
  }

  return (
    <div className="bds-panel">
      <div className="bds-between"><h4>{title}</h4><label className="bds-check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Visible</label></div>
      <input value={tagline} maxLength={160} onChange={(e) => setTagline(e.target.value)} placeholder={base} aria-label={`${title} tagline`} />
      <input value={priceNote} maxLength={80} onChange={(e) => setPriceNote(e.target.value)} placeholder="Pricing note, e.g. From ₦150,000" aria-label={`${title} pricing note`} />
      <div className="bds-row"><button className="button button-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>{msg && <span className="bds-muted" role="status">{msg}</span>}</div>
    </div>
  )
}

function AnalyticsTab({ requests }: { requests: BdsRequest[] }) {
  const [range, setRange] = useState<'7' | '30' | '90' | 'all' | 'custom'>('30')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = useMemo(() => {
    const now = Date.now()
    return requests.filter((r) => {
      const t = toDate(r.createdAt)?.getTime()
      if (t === undefined) return range === 'all'
      if (range === 'all') return true
      if (range === 'custom') {
        return (!from || t >= new Date(from).getTime()) && (!to || t <= new Date(to).getTime() + 86_399_999)
      }
      return t >= now - Number(range) * 86_400_000
    })
  }, [requests, range, from, to])

  const byStatus = STATUSES.map((s) => ({ label: s, value: filtered.filter((r) => r.status === s).length }))
  const byService = SERVICES.map((s) => ({ label: s.title.replace('Business ', '').replace(' and ', ' & '), value: filtered.filter((r) => r.services.includes(s.id)).length }))

  const trend = useMemo(() => {
    const days = new Map<string, number>()
    for (const r of filtered) {
      const d = toDate(r.createdAt)
      if (!d) continue
      const k = d.toISOString().slice(0, 10)
      days.set(k, (days.get(k) ?? 0) + 1)
    }
    return [...days.entries()].sort().map(([label, value]) => ({ label, value }))
  }, [filtered])

  const completed = filtered.filter((r) => r.status === 'Completed')
  const decided = filtered.filter((r) => ['Approved', 'In progress', 'On hold', 'Completed', 'Rejected'].includes(r.status))
  const approvalRate = decided.length ? Math.round((decided.filter((r) => r.status !== 'Rejected').length / decided.length) * 100) : 0
  const avgDays = completed.length
    ? Math.round(completed.reduce((n, r) => n + ((toDate(r.updatedAt)?.getTime() ?? 0) - (toDate(r.createdAt)?.getTime() ?? 0)) / 86_400_000, 0) / completed.length)
    : 0
  const clients = new Set(filtered.map((r) => r.clientId)).size

  function download() {
    const esc = (v: unknown) => {
      let s = String(v ?? '').replace(/"/g, '""')
      if (/^[=+\-@]/.test(s)) s = `'${s}` // neutralise spreadsheet formula injection
      return `"${s}"`
    }
    const head = ['Title', 'Client', 'Email', 'Company', 'Services', 'Status', 'Progress %', 'Budget', 'Timeline', 'Assignee', 'Created']
    const lines = filtered.map((r) => [r.title, r.clientName, r.clientEmail, r.company, r.services.join('; '), r.status, r.progress, r.budget, r.timeline, r.assignee, toDate(r.createdAt)?.toISOString() ?? ''].map(esc).join(','))
    const blob = new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rex-bds-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="bds-toolbar">
        <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="Date range">
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option><option value="custom">Custom</option>
        </select>
        {range === 'custom' && (<><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" /></>)}
        <button className="button bds-ghost" onClick={download} disabled={filtered.length === 0}><Download size={15} aria-hidden="true" />Download CSV</button>
      </div>
      <div className="bds-stats">
        <div><span>Requests</span><strong>{filtered.length}</strong></div>
        <div><span>Clients</span><strong>{clients}</strong></div>
        <div><span>Completed</span><strong>{completed.length}</strong></div>
        <div><span>Approval rate</span><strong>{approvalRate}%</strong></div>
        <div><span>Avg. days to complete</span><strong>{avgDays}</strong></div>
      </div>
      <div className="bds-grid2">
        <div className="bds-panel"><h4>Requests over time</h4><LineChart data={trend} /></div>
        <div className="bds-panel"><h4>By status</h4><BarChart data={byStatus} /><BarLegend data={byStatus} /></div>
        <div className="bds-panel"><h4>Service demand</h4><BarChart data={byService} /><BarLegend data={byService} /></div>
      </div>
    </>
  )
}
