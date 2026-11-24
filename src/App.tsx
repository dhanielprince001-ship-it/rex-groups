
import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Menu,
  X,
  Sun,
  Moon,
  Code2,
  ShoppingBag,
  Workflow,
  Settings,
  Mail,
  Phone,
  MapPin,
  Instagram,
  Linkedin,
  Github,
  Sparkles,
} from 'lucide-react'

import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { AuthButton, AuthSection, useAuth } from './AuthPanel'
import AdminDashboard from './AdminDashboard'
import Reviews from './Reviews'

const EMAIL = 'rexgroups.uk@gmail.com'
const WHATSAPP = '2348033564331'
const PHONE_DISPLAY = '+234 803 356 4331'

const EMAILJS_SERVICE_ID = 'service_o4p3v01'
const EMAILJS_TEMPLATE_ID = 'template_s7fsdbq'
const EMAILJS_PUBLIC_KEY = '0NkqQxyu5RfJ2UFXl'

const SOCIALS = [
  { label: 'LinkedIn', href: '', icon: Linkedin },
  { label: 'Instagram', href: '', icon: Instagram },
  { label: 'GitHub', href: '', icon: Github },
]

const NAV_LINKS = [
  { label: 'About', href: '#about' },
  { label: 'Services', href: '#services' },
  { label: 'Work', href: '#work' },
  { label: 'Process', href: '#process' },
  { label: 'Contact', href: '#contact' },
  { label: 'Admin', href: '#admin' },
]

const SERVICES = [
  {
    icon: Code2,
    number: '01',
    title: 'Website Development',
    text: 'Fast, responsive websites that make your business look credible and help customers take action.',
  },
  {
    icon: ShoppingBag,
    number: '02',
    title: 'E-commerce Solutions',
    text: 'Online storefronts that help you present products, receive enquiries and manage orders.',
  },
  {
    icon: Workflow,
    number: '03',
    title: 'Business Digital Solutions',
    text: 'Practical digital tools and workflows that reduce repetitive work and keep operations organised.',
  },
  {
    icon: Settings,
    number: '04',
    title: 'Maintenance & Support',
    text: 'Ongoing updates, improvements and support to keep your digital presence running smoothly.',
  },
]

const SERVICE_OPTIONS = [
  'Website Development',
  'E-commerce Solutions',
  'Business Digital Solutions',
  'Maintenance & Support',
  'Other / Not sure yet',
]

const PROJECTS = [
  {
    tone: 'fashion',
    tag: 'E-COMMERCE CONCEPT',
    title: 'Modern Fashion Store',
    desc: 'A clean online shopping experience concept for a growing fashion brand.',
    mock: {
      brand: 'ATELIER / 01',
      headline: 'Style your story.',
      cta: 'DISCOVER THE COLLECTION',
    },
  },
  {
    tone: 'beauty',
    tag: 'SERVICE BUSINESS CONCEPT',
    title: 'Beauty Studio Website',
    desc: 'A polished service website concept with clear services and booking enquiries.',
    mock: {
      brand: 'THE BEAUTY ROOM',
      headline: 'Your time to glow.',
      cta: 'EXPLORE OUR SERVICES',
    },
  },
  {
    tone: 'business',
    tag: 'CORPORATE CONCEPT',
    title: 'Business Landing Page',
    desc: 'A focused digital presence concept for a professional service company.',
    mock: {
      brand: 'NORTHSTAR CO.',
      headline: 'Move business forward.',
      cta: 'BUILT FOR WHAT IS NEXT',
    },
  },
]

const PROCESS = [
  {
    n: '01',
    title: 'Understand',
    text: 'We learn about your business, goals and the people you want to reach.',
  },
  {
    n: '02',
    title: 'Plan & design',
    text: 'We shape the right approach and map out a clear digital experience.',
  },
  {
    n: '03',
    title: 'Build',
    text: 'We develop, test and refine the solution across screen sizes.',
  },
  {
    n: '04',
    title: 'Support',
    text: 'We help you launch confidently and plan what comes next.',
  },
]

type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('rex-theme')

    if (saved === 'dark' || saved === 'light') {
      return saved
    }
  } catch {
    // Storage unavailable
  }

  return window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

function getEnquirySource() {
  try {
    const params = new URLSearchParams(window.location.search)

    const campaignSource =
      params.get('utm_source') ||
      params.get('source')

    if (campaignSource) {
      return campaignSource.slice(0, 100)
    }

    if (document.referrer) {
      return new URL(document.referrer).hostname
    }

    return 'Direct'
  } catch {
    return 'Unknown'
  }
}

function App() {
  const { user } = useAuth()

  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [contactError, setContactError] = useState('')

  const closeMenu = () => setMenuOpen(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        'content',
        theme === 'dark' ? '#0b0d10' : '#f5f6f3',
      )

    try {
      localStorage.setItem('rex-theme', theme)
    } catch {
      // Ignore storage errors
    }
  }, [theme])

  useEffect(() => {
    if (!menuOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }

    const onResize = () => {
      if (window.innerWidth > 900) setMenuOpen(false)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [menuOpen])

  async function handleContact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const form = e.currentTarget
    const data = new FormData(form)

    const field = (key: string) =>
      String(data.get(key) ?? '').trim()

    const name = field('name')
    const email = field('email')
    const phone = field('phone')
    const business = field('business')
    const customerType = field('customerType')
    const service = field('service')
    const message = field('message')

    setSent(false)
    setContactError('')

    if (!db) {
      setContactError(
        'The enquiry service is not available right now. Please email us directly.',
      )
      return
    }

    if (
      !name ||
      !email ||
      !customerType ||
      !service ||
      !message
    ) {
      setContactError('Please complete all required fields.')
      return
    }

    setSubmitting(true)

    const source = getEnquirySource()

    try {
      // Save the enquiry in Firebase.
      await addDoc(collection(db, 'enquiries'), {
        name,
        email,
        phone,
        business,
        customerType,
        service,
        message,
        source,
        ...(user ? { userId: user.uid } : {}),
        status: 'Pending',
        createdAt: serverTimestamp(),
      })

      // Send an email notification through EmailJS.
      // Email notification failure does not undo the saved enquiry.
      try {
        const emailResponse = await fetch(
          'https://api.emailjs.com/api/v1.0/email/send',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              service_id: EMAILJS_SERVICE_ID,
              template_id: EMAILJS_TEMPLATE_ID,
              user_id: EMAILJS_PUBLIC_KEY,
              template_params: {
                name,
                email,
                phone: phone || 'Not provided',
                business: business || 'Not provided',
                customer_type: customerType,
                service,
                source,
                message,
                title: 'New Customer Enquiry',
                time: new Date().toLocaleString(),
              },
            }),
          },
        )

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text()
          throw new Error(errorText || 'Email notification failed')
        }

        console.info('Email notification sent successfully.')
      } catch (emailError) {
        console.error('EmailJS notification failed:', emailError)
      }

      setSent(true)
      form.reset()
    } catch (error) {
      console.error('Enquiry submission failed:', error)

      setContactError(
        'We could not submit your enquiry. Please try again or email us directly.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const visibleSocials = SOCIALS.filter(
    (social) => social.href.trim() !== '',
  )

  return (
    <div className={`app ${theme}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="header">
        <a className="brand" href="#home" onClick={closeMenu}>
          <span className="brand-mark">
            R<span>.</span>
          </span>

          <span className="brand-name">
            REX GROUPS
            <small>TECHNOLOGY · BUSINESS · INNOVATION</small>
          </span>
        </a>

        <nav
          id="site-nav"
          aria-label="Main"
          className={menuOpen ? 'nav open' : 'nav'}
        >
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              onClick={closeMenu}
            >
              {label}
            </a>
          ))}

          <a
            className="nav-cta"
            href="#contact"
            onClick={closeMenu}
          >
            Let's talk
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>

          <div className="mobile-auth">
            <AuthButton onOpen={closeMenu} />
          </div>
        </nav>

        <div className="header-actions">
          <div className="desktop-auth">
            <AuthButton />
          </div>

          <button
            type="button"
            className="icon-btn theme-btn"
            aria-label={`Switch to ${
              theme === 'dark' ? 'light' : 'dark'
            } theme`}
            onClick={() =>
              setTheme(theme === 'dark' ? 'light' : 'dark')
            }
          >
            {theme === 'dark' ? (
              <Sun size={18} aria-hidden="true" />
            ) : (
              <Moon size={18} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            className="icon-btn menu-btn"
            aria-label={
              menuOpen ? 'Close navigation' : 'Open navigation'
            }
            aria-expanded={menuOpen}
            aria-controls="site-nav"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? (
              <X aria-hidden="true" />
            ) : (
              <Menu aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      <main id="main">
        <section className="hero section-wrap" id="home">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-dot" aria-hidden="true" />
              DIGITAL SOLUTIONS FOR AMBITIOUS BUSINESSES
            </div>

            <h1>
              Build beyond
              <br />
              <span>what's possible.</span>
            </h1>

            <p className="hero-lead">
              We help businesses move forward with thoughtful technology,
              powerful digital experiences and solutions built for growth.
            </p>

            <div className="hero-buttons">
              <a className="button button-primary" href="#contact">
                Start a project
                <ArrowUpRight size={17} aria-hidden="true" />
              </a>

              <a className="text-link" href="#services">
                Explore what we do
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>

            <div className="hero-footnote">
              <span>01 / 04</span>
              <span>INNOVATION WITH PURPOSE</span>
            </div>
          </div>

          <div
            className="hero-art"
            role="img"
            aria-label="Abstract digital architecture artwork"
          >
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-core">
              <span>R</span>
            </div>
            <div className="art-line line-one" />
            <div className="art-line line-two" />

            <div className="art-label label-top">
              <Sparkles size={14} aria-hidden="true" />
              IDEAS INTO IMPACT
            </div>

            <div className="art-label label-bottom">
              REX GROUPS <span>— EST. 2026</span>
            </div>

            <div className="art-index">RG / 001</div>
          </div>
        </section>

        <section className="trust-strip" aria-label="Our values">
          <div className="section-wrap strip-inner">
            <span>
              BUILT FOR THE NEXT GENERATION OF BUSINESS
            </span>

            <div>
              <b>CLARITY</b><i />
              <b>CREATIVITY</b><i />
              <b>TECHNOLOGY</b><i />
              <b>GROWTH</b>
            </div>
          </div>
        </section>

        <section className="section-wrap section-block" id="about">
          <div className="section-kicker">
            01 — WHO WE ARE
          </div>

          <div className="about-grid">
            <h2>
              Technology should
              <br />
              make business <em>better.</em>
            </h2>

            <div className="about-copy">
              <p>
                Rex Groups is a technology-focused company helping small
                businesses build a stronger digital presence and work smarter.
              </p>

              <p>
                We bring strategy, design and development together to create
                useful digital experiences — with a long-term vision to build
                technology products that serve businesses across the world.
              </p>

              <a className="inline-link" href="#contact">
                Get to know us
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="stats-row">
            <div>
              <strong>01</strong>
              <span>Clear, practical thinking</span>
            </div>

            <div>
              <strong>02</strong>
              <span>Designed around people</span>
            </div>

            <div>
              <strong>03</strong>
              <span>Built to keep improving</span>
            </div>
          </div>
        </section>

        <section className="services-section" id="services">
          <div className="section-wrap section-block">
            <div className="section-kicker">
              02 — WHAT WE DO
            </div>

            <div className="section-heading">
              <h2>
                Digital tools for
                <br />
                <em>real-world growth.</em>
              </h2>

              <p>
                From your first website to smarter business workflows, we help
                turn good ideas into useful digital experiences.
              </p>
            </div>

            <div className="service-grid">
              {SERVICES.map(
                ({ icon: Icon, number, title, text }) => (
                  <article className="service-card" key={number}>
                    <div className="service-top">
                      <span>{number}</span>
                      <Icon
                        size={23}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    </div>

                    <h3>{title}</h3>
                    <p>{text}</p>

                    <a
                      href="#contact"
                      aria-label={`Enquire about ${title}`}
                    >
                      <ArrowUpRight
                        size={18}
                        aria-hidden="true"
                      />
                    </a>
                  </article>
                ),
              )}
            </div>
          </div>
        </section>

        <section className="section-wrap section-block" id="work">
          <div className="section-kicker">
            03 — SELECTED CONCEPTS
          </div>

          <div className="section-heading">
            <h2>
              Ideas made <em>visible.</em>
            </h2>

            <p>
              These are demonstration concepts showing the kind of digital
              experiences Rex Groups aims to create. They are not presented
              as completed client projects.
            </p>
          </div>

          <div className="project-grid">
            {PROJECTS.map((p, i) => (
              <article className="project-card" key={p.title}>
                <div
                  className={`project-visual ${p.tone}`}
                  aria-hidden="true"
                >
                  <div className="visual-window">
                    <div className="window-bar">
                      <i />
                      <i />
                      <i />
                    </div>

                    <div className="visual-content">
                      <span>{p.mock.brand}</span>
                      <b>{p.mock.headline}</b>
                      <small>{p.mock.cta}</small>
                    </div>
                  </div>

                  <span className="project-number">
                    0{i + 1}
                  </span>
                </div>

                <div className="project-info">
                  <div>
                    <span>{p.tag}</span>
                    <h3>{p.title}</h3>
                    <p>{p.desc}</p>
                  </div>

                  <a
                    href="#contact"
                    aria-label={`Ask about a project like ${p.title}`}
                  >
                    <ArrowUpRight
                      size={20}
                      aria-hidden="true"
                    />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="process-section" id="process">
          <div className="section-wrap section-block">
            <div className="section-kicker">
              04 — HOW WE WORK
            </div>

            <div className="section-heading">
              <h2>
                Good work starts
                <br />
                with <em>good thinking.</em>
              </h2>

              <p>
                A straightforward process keeps every project focused,
                collaborative and moving in the right direction.
              </p>
            </div>

            <div className="process-grid">
              {PROCESS.map((s) => (
                <div key={s.n}>
                  <span>{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="contact-section" id="contact">
          <div className="section-wrap contact-grid">
            <div>
              <div className="section-kicker">
                05 — LET'S BUILD SOMETHING
              </div>

              <h2>
                Have a business
                <br />
                goal in <em>mind?</em>
              </h2>

              <p>
                Tell us what you're working on. Let's explore how technology
                can help you move forward.
              </p>

              <div className="contact-details">
                <a href={`mailto:${EMAIL}`}>
                  <Mail size={17} aria-hidden="true" />
                  {EMAIL}
                </a>

                <a
                  href={`https://wa.me/${WHATSAPP}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Phone size={17} aria-hidden="true" />
                  {PHONE_DISPLAY} (WhatsApp)
                </a>

                <span>
                  <MapPin size={17} aria-hidden="true" />
                  Nigeria · Working towards a global reach
                </span>
              </div>
            </div>

            <form
              className="contact-form"
              onSubmit={handleContact}
            >
              <div className="form-heading">
                Tell us about your project
                <ArrowUpRight size={18} aria-hidden="true" />
              </div>

              <label>
                Your name

                <input
                  name="name"
                  placeholder="Full name"
                  autoComplete="name"
                  maxLength={100}
                  required
                  disabled={submitting}
                />
              </label>

              <label>
                Email address

                <input
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  maxLength={150}
                  required
                  disabled={submitting}
                />
              </label>

              <label>
                Phone number
                <span className="optional">(optional)</span>

                <input
                  name="phone"
                  type="tel"
                  placeholder="+234..."
                  autoComplete="tel"
                  maxLength={30}
                  disabled={submitting}
                />
              </label>

              <label>
                Are you enquiring as an individual or business?

                <select
                  name="customerType"
                  required
                  defaultValue=""
                  disabled={submitting}
                >
                  <option value="" disabled>
                    Select an option
                  </option>
                  <option value="Individual">Individual</option>
                  <option value="Company / Organisation">
                    Company / Organisation
                  </option>
                </select>
              </label>

              <label>
                Business name
                <span className="optional">(optional)</span>

                <input
                  name="business"
                  placeholder="Your business"
                  autoComplete="organization"
                  maxLength={120}
                  disabled={submitting}
                />
              </label>

              <label>
                Which service are you interested in?

                <select
                  name="service"
                  required
                  defaultValue=""
                  disabled={submitting}
                >
                  <option value="" disabled>
                    Select a service
                  </option>

                  {SERVICE_OPTIONS.map((service) => (
                    <option key={service} value={service}>
                      {service}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Tell us about your project

                <textarea
                  name="message"
                  rows={4}
                  maxLength={1500}
                  placeholder="A little about your project..."
                  required
                  disabled={submitting}
                />
              </label>

              <button
                className="button button-primary submit-btn"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Sending...' : 'Send enquiry'}

                {!submitting && (
                  <ArrowUpRight
                    size={17}
                    aria-hidden="true"
                  />
                )}
              </button>

              {sent && (
                <small
                  className="form-note"
                  role="status"
                  aria-live="polite"
                >
                  Thank you! Your enquiry has been submitted successfully.
                  We'll be in touch.
                </small>
              )}

              {contactError && (
                <small className="form-note" role="alert">
                  {contactError}{' '}
                  <a
                    className="note-link"
                    href={`mailto:${EMAIL}`}
                  >
                    {EMAIL}
                  </a>
                </small>
              )}

              <small className="form-note">
                Your enquiry will be securely submitted to Rex Groups
                for follow-up.
              </small>
            </form>
          </div>
        </section>

        <AuthSection />

        <AdminDashboard />
      </main>

      <footer className="footer">
        <div className="section-wrap footer-top">
          <a className="brand" href="#home">
            <span className="brand-mark">
              R<span>.</span>
            </span>

            <span className="brand-name">
              REX GROUPS
              <small>TECHNOLOGY · BUSINESS · INNOVATION</small>
            </span>
          </a>

          <p>
            Building useful technology
            <br />
            for a world in motion.
          </p>

          <a className="back-top" href="#home">
            BACK TO TOP ↑
          </a>
        </div>

        <div className="section-wrap footer-bottom">
          <span>
            © {new Date().getFullYear()} Rex Groups. All rights reserved.
          </span>

          <span>Made with purpose in Nigeria.</span>

          <div>
            <a href={`mailto:${EMAIL}`} aria-label="Email">
              <Mail size={16} aria-hidden="true" />
            </a>

            {visibleSocials.map(
              ({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon size={16} aria-hidden="true" />
                </a>
              ),
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
