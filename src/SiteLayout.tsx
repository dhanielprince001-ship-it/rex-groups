import {
  useEffect,
  useState,
  type CSSProperties,
} from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ArrowUpRight, Sun, Moon, Mail } from 'lucide-react'
import { useTheme } from './ThemeContext'

import { AuthButton } from './AuthPanel'
import { EMAIL, NAV_LINKS, SOCIALS } from './siteConfig'

type Theme = 'dark' | 'light'

const MOBILE_QUERY = '(max-width: 900px)'

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

// Reactive replacement for reading window.innerWidth during render.
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia?.(MOBILE_QUERY).matches ?? false,
  )

  useEffect(() => {
    const query = window.matchMedia?.(MOBILE_QUERY)
    if (!query) return

    const onChange = () => setIsMobile(query.matches)

    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return isMobile
}

// The splash screen only plays on the first visit, not every time the
// visitor comes back from the marketplace (which sits outside this layout).
let loaderAlreadyShown = false

export default function SiteLayout() {
  const { pathname } = useLocation()
  const isMobile = useIsMobile()

  const { theme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(!loaderAlreadyShown)

  const closeMenu = () => setMenuOpen(false)

  // Loading screen (shown once when the site first opens)
  useEffect(() => {
    if (!isLoading) return

    const timer = window.setTimeout(() => {
      loaderAlreadyShown = true
      setIsLoading(false)
    }, 1600)

    return () => window.clearTimeout(timer)
  }, [isLoading])

  // Close the mobile menu whenever the page changes
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Theme management
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

  // Mobile navigation management
  useEffect(() => {
    if (!menuOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }

    const onResize = () => {
      if (window.innerWidth > 900) setMenuOpen(false)
    }

    document.body.classList.add('menu-is-open')

    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)

    return () => {
      document.body.classList.remove('menu-is-open')
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [menuOpen])

  const visibleSocials = SOCIALS.filter(
    (social) => social.href.trim() !== '',
  )

  return (
    <div className={`app ${theme}`}>
      {/* PREMIUM REX GROUPS LOADING SCREEN */}
      {isLoading && (
        <div
          className="rex-loader"
          role="status"
          aria-label="Loading Rex Groups"
        >
          <div className="loader-content">
            <div className="loader-logo">
              R<span>.</span>
            </div>

            <h2>REX GROUPS</h2>

            <p>TECHNOLOGY · BUSINESS · INNOVATION</p>

            <div className="loader-track">
              <div className="loader-progress" />
            </div>

            <span className="loader-caption">
              BUILDING WHAT'S NEXT
            </span>
          </div>
        </div>
      )}

      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="header">
        <Link className="brand" to="/#home" onClick={closeMenu}>
          <span className="brand-mark">
            R<span>.</span>
          </span>

          <span className="brand-name">
            REX GROUPS
            <small>TECHNOLOGY · BUSINESS · INNOVATION</small>
          </span>
        </Link>

        <nav
          id="site-nav"
          aria-label="Main"
          className={menuOpen ? 'nav open' : 'nav'}
          aria-hidden={isMobile && !menuOpen ? true : undefined}
        >
          {NAV_LINKS.map(({ label, to }, index) => (
            <Link
              key={label}
              to={to}
              onClick={closeMenu}
              style={{ '--nav-index': index } as CSSProperties}
              tabIndex={isMobile && !menuOpen ? -1 : 0}
              aria-current={
                to === '/marketplace' && pathname === '/marketplace'
                  ? 'page'
                  : undefined
              }
            >
              {label}
            </Link>
          ))}

          <Link
            className="nav-cta"
            to="/#contact"
            onClick={closeMenu}
            tabIndex={isMobile && !menuOpen ? -1 : 0}
          >
            Let's talk
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>

          <div className="mobile-auth">
            <AuthButton onOpen={closeMenu} />
          </div>
        </nav>

        {menuOpen && (
          <button
            type="button"
            className="menu-overlay"
            aria-label="Close navigation menu"
            onClick={closeMenu}
          />
        )}

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
            onClick={toggleTheme}
          >
            {theme === 'dark' ? (
              <Sun size={18} aria-hidden="true" />
            ) : (
              <Moon size={18} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            className={`icon-btn menu-btn ${menuOpen ? 'active' : ''}`}
            aria-label={
              menuOpen ? 'Close navigation' : 'Open navigation'
            }
            aria-expanded={menuOpen}
            aria-controls="site-nav"
            onClick={() => setMenuOpen((previous) => !previous)}
          >
            <span className="menu-icon-lines">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </header>

      <main id="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="section-wrap footer-top">
          <Link className="brand" to="/#home">
            <span className="brand-mark">
              R<span>.</span>
            </span>

            <span className="brand-name">
              REX GROUPS
              <small>TECHNOLOGY · BUSINESS · INNOVATION</small>
            </span>
          </Link>

          <p>
            Building useful technology
            <br />
            for a world in motion.
          </p>

          <Link className="back-top" to="/#home">
            BACK TO TOP ↑
          </Link>
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
