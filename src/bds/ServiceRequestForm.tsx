
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Loader2, Send } from 'lucide-react'
import { useAuth } from '../AuthPanel'
import { bdsApi } from './api'
import { MAX_ATTACHMENTS, checkAttachment, uploadAttachment } from './uploads'
import { SERVICES } from './catalog'
import { BUDGETS, CONTACTS, TIMELINES, type ServiceId } from './types'

interface Props {
  preselect?: ServiceId | null
  activeIds?: ServiceId[]
  onSubmitted?: () => void
}

export default function ServiceRequestForm({ preselect, activeIds, onSubmitted }: Props) {
  const { user, ready } = useAuth()
  const [services, setServices] = useState<ServiceId[]>(preselect ? [preselect] : [])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [company, setCompany] = useState('')
  const [phone, setPhone] = useState('')
  const [budget, setBudget] = useState<string>(BUDGETS[0])
  const [timeline, setTimeline] = useState<string>(TIMELINES[0])
  const [contactMethod, setContactMethod] = useState<string>(CONTACTS[0])
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (preselect) setServices((prev) => (prev.includes(preselect) ? prev : [...prev, preselect]))
  }, [preselect])

  const visible = SERVICES.filter((s) => !activeIds || activeIds.includes(s.id))

  function toggle(id: ServiceId) {
    setServices((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }

  function addFiles(list: FileList | null) {
    if (!list) return

    const next = [...files]

    for (const file of Array.from(list)) {
      const problem = checkAttachment(file)

      if (problem) return setError(problem)

      if (next.length >= MAX_ATTACHMENTS) return setError(`You can attach up to ${MAX_ATTACHMENTS} images.`)

      next.push(file)
    }

    setError('')
    setFiles(next)
  }

  function validate() {
    if (services.length === 0) return 'Select at least one service.'
    if (title.trim().length < 5) return 'Give your project a title of at least 5 characters.'
    if (description.trim().length < 30) return 'Describe your needs in at least 30 characters.'
    if (phone.trim() && !/^[+\d\s()-]{5,30}$/.test(phone.trim())) return 'Enter a valid phone number.'
    return ''
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!user || busy) return
    const problem = validate()
    if (problem) return setError(problem)

    setBusy(true)
    setError('')
    try {
      // Upload images first (one at a time), then send the request.
      const attachments = []

      for (let index = 0; index < files.length; index++) {
        setProgress(`Uploading image ${index + 1} of ${files.length}…`)
        attachments.push(await uploadAttachment(user, files[index]))
      }

      setProgress('')

      await bdsApi(user, 'createRequest', {
        services, title, description, company, phone, budget, timeline, contactMethod, attachments,
        clientName: user.displayName || user.email || '',
      })
      setFiles([])
      setDone(true)
      setTitle('')
      setDescription('')
      setServices([])
      onSubmitted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your request.')
    } finally {
      setProgress('')
      setBusy(false)
    }
  }

  if (!ready) return <div className="bds-panel bds-muted">Loading…</div>

  if (!user) {
    return (
      <div className="bds-panel bds-center">
        <h3>Sign in to submit a request</h3>
        <p className="bds-muted">An account lets you track progress, view updates and message our team.</p>
        <Link className="button button-primary" to="/#account">Sign in / Register</Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="bds-panel bds-center" role="status">
        <CheckCircle2 size={36} aria-hidden="true" className="bds-ok" />
        <h3>Request received</h3>
        <p className="bds-muted">We will review it shortly. You can follow progress in your dashboard.</p>
        <div className="bds-row bds-center-row">
          <Link className="button button-primary" to="/business-digital-solutions/dashboard">Open my dashboard</Link>
          <button type="button" className="button bds-ghost" onClick={() => setDone(false)}>Submit another</button>
        </div>
      </div>
    )
  }

  return (
    <form className="bds-panel bds-form" onSubmit={submit} noValidate>
      <fieldset>
        <legend>Which services do you need?</legend>
        <div className="bds-chips">
          {visible.map((s) => (
            <label key={s.id} className={services.includes(s.id) ? 'bds-chip on' : 'bds-chip'}>
              <input type="checkbox" checked={services.includes(s.id)} onChange={() => toggle(s.id)} />
              {s.title}
            </label>
          ))}
        </div>
      </fieldset>

      <label>Project title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Automate order confirmations" />
      </label>

      <label>Describe your needs
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={5}
          placeholder="What slows your business down today? What should the result look like?" />
        <small>{description.trim().length}/2000</small>
      </label>

      <div className="bds-grid2">
        <label>Company (optional)<input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} /></label>
        <label>Phone (optional)<input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} inputMode="tel" /></label>
        <label>Budget
          <select value={budget} onChange={(e) => setBudget(e.target.value)}>{BUDGETS.map((b) => <option key={b}>{b}</option>)}</select>
        </label>
        <label>Timeline
          <select value={timeline} onChange={(e) => setTimeline(e.target.value)}>{TIMELINES.map((b) => <option key={b}>{b}</option>)}</select>
        </label>
        <label>Preferred contact
          <select value={contactMethod} onChange={(e) => setContactMethod(e.target.value)}>{CONTACTS.map((b) => <option key={b}>{b}</option>)}</select>
        </label>
      </div>

      <div className="bds-files">
        <label>Attach images (optional, up to {MAX_ATTACHMENTS}, JPG/PNG/WEBP, 5MB each)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>

        {files.length > 0 && (
          <ul>
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <span>{file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)</span>
                <button type="button" disabled={busy} onClick={() => setFiles(files.filter((_, i) => i !== index))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {progress && <p className="bds-muted" role="status">{progress}</p>}
      {error && <p className="bds-error" role="alert">{error}</p>}

      <button className="button button-primary" disabled={busy} type="submit">
        {busy ? <Loader2 size={16} className="bds-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
        {busy ? 'Sending…' : 'Submit request'}
      </button>
    </form>
  )
}
