import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, Mail, MessageCircle, Phone } from 'lucide-react'

import { db } from './firebase'
import { useAuth } from './AuthPanel'
import { EMAIL, PHONE_DISPLAY, WHATSAPP } from './siteConfig'
import { BENEFITS, FAQS, PROCESS, SERVICES } from './bds/catalog'
import ServiceRequestForm from './bds/ServiceRequestForm'
import { type BdsServiceOverride, type ServiceId } from './bds/types'
import { useStaffRole } from './bds/useStaffRole'
import './bds.css'

export default function BusinessDigitalSolutionsPage() {
  const { user } = useAuth()
  const { level } = useStaffRole()
  const [overrides, setOverrides] = useState<Record<string, BdsServiceOverride>>({})
  const [selected, setSelected] = useState<ServiceId>('automation')
  const [preselect, setPreselect] = useState<ServiceId | null>(null)

  // Admin-managed overrides (enabled/disabled, tagline). Falls back to the built-in catalogue.
  useEffect(() => {
    if (!db) return
    return onSnapshot(
      collection(db, 'bdsServices'),
      (snap) => {
        const next: Record<string, BdsServiceOverride> = {}
        snap.forEach((d) => { next[d.id] = { id: d.id as ServiceId, ...d.data() } })
        setOverrides(next)
      },
      () => undefined,
    )
  }, [])

  const services = useMemo(
    () => SERVICES.filter((s) => overrides[s.id]?.active !== false).map((s) => ({
      ...s,
      tagline: overrides[s.id]?.tagline || s.tagline,
      priceNote: overrides[s.id]?.priceNote || '',
    })),
    [overrides],
  )

  const current = services.find((s) => s.id === selected) ?? services[0]
  const whatsappHref = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hello Rex Groups, I would like a consultation about Business Digital Solutions.')}`

  function requestService(id: ServiceId) {
    setPreselect(id)
    document.getElementById('request')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="bds">
      <section className="section-wrap section-block bds-hero">
        <Link className="inline-link" to="/#services"><ArrowLeft size={16} aria-hidden="true" />All services</Link>
        <div className="section-kicker">BUSINESS DIGITAL SOLUTIONS</div>
        <div className="about-grid">
          <h1 className="bds-title">Run your business on <em>smarter</em> systems.</h1>
          <div className="about-copy">
            <p>Automation, management systems, payments, reporting and integrations, designed around how your business actually works.</p>
            <div className="bds-row">
              <a className="button button-primary" href="#request">Request a service<ArrowUpRight size={17} aria-hidden="true" /></a>
              <a className="button bds-ghost" href="#consultation">Book a consultation</a>
              <Link className="text-link" to="/business-digital-solutions/dashboard">{user ? 'My dashboard' : 'Client login'}</Link>
            </div>
            {level >= 1 && <Link className="text-link" to="/business-digital-solutions/admin">Open staff dashboard</Link>}
          </div>
        </div>
      </section>

      <section className="services-section" id="bds-services">
        <div className="section-wrap section-block">
          <div className="section-kicker">OUR SERVICES</div>
          <div className="section-heading">
            <h2>Six ways we <em>simplify</em> your operations.</h2>
            <p>Choose one, or combine several into a single connected system.</p>
          </div>
          <div className="bds-cards">
            {services.map(({ id, icon: Icon, number, title, tagline, priceNote }) => (
              <article className={`bds-card ${selected === id ? 'active' : ''}`} key={id}>
                <div className="service-top"><span>{number}</span><Icon size={23} strokeWidth={1.5} aria-hidden="true" /></div>
                <h3>{title}</h3>
                <p>{tagline}</p>
                {priceNote && <small className="bds-muted">{priceNote}</small>}
                <div className="bds-row">
                  <button type="button" className="text-link bds-linkbtn" onClick={() => { setSelected(id); document.getElementById('bds-detail')?.scrollIntoView({ behavior: 'smooth' }) }}>Details</button>
                  <button type="button" className="text-link bds-linkbtn" onClick={() => requestService(id)}>Request <ArrowUpRight size={14} aria-hidden="true" /></button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {current && (
        <section className="section-wrap section-block" id="bds-detail">
          <div className="section-kicker">SERVICE DETAILS</div>
          <div className="bds-tabs" role="tablist">
            {services.map((s) => (
              <button key={s.id} role="tab" aria-selected={s.id === current.id} className={s.id === current.id ? 'on' : ''} onClick={() => setSelected(s.id)}>{s.number}</button>
            ))}
          </div>
          <div className="bds-detail">
            <div>
              <h2>{current.title}</h2>
              <p className="bds-lead">{current.description}</p>
              <button type="button" className="button button-primary" onClick={() => requestService(current.id)}>Request this service<ArrowUpRight size={17} aria-hidden="true" /></button>
            </div>
            <div className="bds-two">
              <div>
                <h4>What's included</h4>
                <ul className="bds-checks">{current.features.map((f) => <li key={f}><Check size={15} aria-hidden="true" />{f}</li>)}</ul>
              </div>
              <div>
                <h4>Business benefits</h4>
                <ul className="bds-checks">{current.benefits.map((f) => <li key={f}><Check size={15} aria-hidden="true" />{f}</li>)}</ul>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="services-section">
        <div className="section-wrap section-block">
          <div className="section-kicker">WHY REX GROUPS</div>
          <div className="section-heading"><h2>Benefits that <em>show up</em> in the business.</h2></div>
          <div className="bds-benefits">
            {BENEFITS.map((b) => <div key={b.title}><h3>{b.title}</h3><p>{b.text}</p></div>)}
          </div>
        </div>
      </section>

      <section className="process-section">
        <div className="section-wrap section-block">
          <div className="section-kicker">HOW WE WORK</div>
          <div className="section-heading"><h2>From request to <em>launch.</em></h2></div>
          <div className="process-grid">
            {PROCESS.map((s) => <div key={s.n}><span>{s.n}</span><h3>{s.title}</h3><p>{s.text}</p></div>)}
          </div>
        </div>
      </section>

      <section className="section-wrap section-block" id="faq">
        <div className="section-kicker">FAQ</div>
        <div className="section-heading"><h2>Common <em>questions.</em></h2></div>
        <div className="bds-faq">
          {FAQS.map((f) => (
            <details key={f.q}>
              <summary>{f.q}<ChevronDown size={18} aria-hidden="true" /></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="section-wrap section-block bds-cta" id="consultation">
        <div className="section-kicker">FREE CONSULTATION</div>
        <h2>Not sure where to <em>start?</em></h2>
        <p>Talk to us first. We will help you decide which service fits.</p>
        <div className="bds-row bds-center-row">
          <a className="button button-primary" href={whatsappHref} target="_blank" rel="noreferrer"><MessageCircle size={16} aria-hidden="true" />WhatsApp us</a>
          <a className="button bds-ghost" href={`mailto:${EMAIL}?subject=${encodeURIComponent('Business Digital Solutions consultation')}`}><Mail size={16} aria-hidden="true" />Email</a>
          <a className="button bds-ghost" href={`tel:+${WHATSAPP}`}><Phone size={16} aria-hidden="true" />{PHONE_DISPLAY}</a>
        </div>
      </section>

      <section className="section-wrap section-block" id="request">
        <div className="section-kicker">SERVICE REQUEST</div>
        <div className="section-heading">
          <h2>Tell us what you <em>need.</em></h2>
          <p>Submit a request, then track progress and message us from your dashboard.</p>
        </div>
        <ServiceRequestForm preselect={preselect} activeIds={services.map((s) => s.id)} />
      </section>
    </div>
  )
}
