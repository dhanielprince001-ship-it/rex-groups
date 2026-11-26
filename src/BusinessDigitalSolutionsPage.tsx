
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Workflow,
} from 'lucide-react'

const OFFERINGS = [
  {
    icon: Workflow,
    number: '01',
    title: 'Workflow automation',
    text: 'Replace repeated copying, manual follow-ups and reminders with simple automated steps.',
  },
  {
    icon: LayoutDashboard,
    number: '02',
    title: 'Business tools',
    text: 'Simple tools to track orders, customers, stock or tasks in one organised place.',
  },
  {
    icon: ClipboardList,
    number: '03',
    title: 'Forms & records',
    text: 'Digital forms and tidy records instead of scattered notebooks and chat threads.',
  },
  {
    icon: BarChart3,
    number: '04',
    title: 'Clear reporting',
    text: 'Easy summaries that show how the business is doing without compiling reports by hand.',
  },
]

const STEPS = [
  {
    n: '01',
    title: 'Review',
    text: 'We look at how your business runs day to day and where time is being lost.',
  },
  {
    n: '02',
    title: 'Prioritise',
    text: 'We agree which repetitive tasks are worth simplifying first.',
  },
  {
    n: '03',
    title: 'Build & test',
    text: 'We set up the tools and workflows, then test them with your real tasks.',
  },
  {
    n: '04',
    title: 'Hand over',
    text: 'We help your team get started and keep improving things as you grow.',
  },
]

export default function BusinessDigitalSolutionsPage() {
  return (
    <>
      <section className="section-wrap section-block bds-hero">
        <Link className="inline-link" to="/#services">
          <ArrowLeft size={16} aria-hidden="true" />
          All services
        </Link>

        <div className="section-kicker">03 — BUSINESS DIGITAL SOLUTIONS</div>

        <div className="about-grid">
          <h1 className="bds-title">
            Less repetitive work.
            <br />
            More <em>organised</em> operations.
          </h1>

          <div className="about-copy">
            <p>
              Practical digital tools and workflows that reduce repetitive
              work and keep operations organised.
            </p>

            <Link className="button button-primary" to="/#contact">
              Start a project
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <section className="services-section">
        <div className="section-wrap section-block">
          <div className="section-kicker">WHAT IT COVERS</div>

          <div className="section-heading">
            <h2>
              Tools that fit how
              <br />
              <em>you already work.</em>
            </h2>

            <p>
              We keep things simple and practical, so your team spends less
              time on admin and more time on the business.
            </p>
          </div>

          <div className="service-grid">
            {OFFERINGS.map(({ icon: Icon, number, title, text }) => (
              <article className="service-card" key={number}>
                <div className="service-top">
                  <span>{number}</span>
                  <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
                </div>

                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="process-section">
        <div className="section-wrap section-block">
          <div className="section-kicker">HOW WE WORK</div>

          <div className="section-heading">
            <h2>
              A simple path from
              <br />
              <em>messy to organised.</em>
            </h2>

            <p>
              Every business is different, so we start with how you work
              today and build from there.
            </p>
          </div>

          <div className="process-grid">
            {STEPS.map((s) => (
              <div key={s.n}>
                <span>{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-wrap section-block bds-cta">
        <div className="section-kicker">LET'S TALK</div>

        <h2>
          Ready to simplify <em>your operations?</em>
        </h2>

        <p>
          Tell us what slows your business down and we'll explore what can
          be improved.
        </p>

        <Link className="button button-primary" to="/#contact">
          Start a project
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </>
  )
}
