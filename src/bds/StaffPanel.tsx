
import { useEffect, useState, type FormEvent } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthPanel'
import { bdsApi } from './api'

interface StaffRow {
  id: string
  email?: string
  name?: string
  role?: string
}

// Owner-only: add, change or remove staff.
export default function StaffPanel() {
  const { user } = useAuth()
  const [rows, setRows] = useState<StaffRow[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('support')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    if (!db) return
    return onSnapshot(
      collection(db, 'staff'),
      (snap) => setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as StaffRow)),
      () => setError('Could not load staff.'),
    )
  }, [])

  async function run(key: string, action: string, payload: Record<string, unknown>, success: string) {
    if (!user) return
    setBusy(key)
    setError('')
    setOk('')
    try {
      await bdsApi(user, action, payload)
      setOk(success)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setBusy('')
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    await run('add', 'saveStaff', { email: email.trim(), role }, 'Staff member saved.')
    setEmail('')
  }

  return (
    <div className="bds-panel">
      <h4>Staff access</h4>
      <p className="bds-muted">
        <strong>Support</strong> can answer clients, post progress updates and reply in order disputes.{' '}
        <strong>Manager</strong> can also approve or reject requests, assign work, send quotes, record payments and manage
        clients and services. Neither role can pay out sellers, refund buyers or change marketplace settings.
      </p>

      <form className="bds-row" onSubmit={add}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Staff member's account email"
          aria-label="Staff email"
          style={{ flex: 1, minWidth: 220 }}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" style={{ width: 'auto' }}>
          <option value="support">Support</option>
          <option value="manager">Manager</option>
        </select>
        <button className="button button-primary" type="submit" disabled={busy === 'add' || !email.trim()}>
          {busy === 'add' ? 'Saving…' : 'Add'}
        </button>
      </form>
      <p className="bds-muted">They must register on the website first, using that same email.</p>

      <div className="bds-table-wrap">
        <table className="bds-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="bds-muted">No staff yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name || '—'}</td>
                <td>{r.email}</td>
                <td>
                  <select
                    value={r.role}
                    disabled={!!busy}
                    aria-label={`Role for ${r.email}`}
                    style={{ width: 'auto' }}
                    onChange={(e) => void run(r.id, 'saveStaff', { email: r.email, role: e.target.value }, 'Role updated.')}
                  >
                    <option value="support">Support</option>
                    <option value="manager">Manager</option>
                  </select>
                </td>
                <td>
                  <button
                    className="text-link bds-linkbtn"
                    disabled={!!busy}
                    onClick={() => {
                      if (window.confirm(`Remove staff access for ${r.email}?`)) {
                        void run(r.id, 'removeStaff', { staffId: r.id }, 'Staff access removed.')
                      }
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ok && <p className="bds-ok" role="status">{ok}</p>}
      {error && <p className="bds-error" role="alert">{error}</p>}
    </div>
  )
}
