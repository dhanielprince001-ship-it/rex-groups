import { BarChart3, CreditCard, LayoutDashboard, Plug, Users, Workflow, type LucideIcon } from 'lucide-react'
import type { ServiceId } from './types'

export interface ServiceInfo {
  id: ServiceId
  number: string
  icon: LucideIcon
  title: string
  tagline: string
  description: string
  features: string[]
  benefits: string[]
}

export const SERVICES: ServiceInfo[] = [
  {
    id: 'automation',
    number: '01',
    icon: Workflow,
    title: 'Business Process Automation',
    tagline: 'Let routine work run itself.',
    description:
      'We turn repeated manual steps into dependable automated workflows, so customers are updated on time and your team stops chasing the same tasks every day.',
    features: ['Automated notifications', 'Appointment reminders', 'Order confirmations', 'Follow-up sequences', 'Task scheduling', 'Email workflows and process triggers'],
    benefits: ['Fewer missed follow-ups', 'Hours saved every week', 'Consistent customer experience'],
  },
  {
    id: 'management',
    number: '02',
    icon: LayoutDashboard,
    title: 'Digital Business Management Systems',
    tagline: 'One place to run the business.',
    description:
      'A central system for the people, tasks and records your business depends on, with role-based access so each person sees exactly what they need.',
    features: ['Operations dashboards', 'Staff and task management', 'Appointments and orders', 'Customer records', 'Activity tracking', 'Admin controls and permissions'],
    benefits: ['Clear accountability', 'Less scattered information', 'Control over who sees what'],
  },
  {
    id: 'customers',
    number: '03',
    icon: Users,
    title: 'Customer and Order Management',
    tagline: 'Know every customer and every order.',
    description:
      'Registration, profiles, order tracking and enquiry handling in one workflow, with full communication history and status updates your customers can follow.',
    features: ['Customer registration and profiles', 'Order tracking', 'Enquiry management', 'Communication history', 'Status updates', 'Search and filtering'],
    benefits: ['Faster replies', 'Fewer "where is my order" calls', 'Better repeat business'],
  },
  {
    id: 'payments',
    number: '04',
    icon: CreditCard,
    title: 'Online Payment Integration',
    tagline: 'Get paid securely, online.',
    description:
      'We connect local and international payment providers to your business with server-side verification, so every payment is confirmed before an order is marked paid. Secret keys never touch the browser.',
    features: ['Local and international providers', 'Transaction records', 'Payment status tracking', 'Confirmations and receipts', 'Payment history', 'Secure server-side verification'],
    benefits: ['Trustworthy checkout', 'Reconciled records', 'Protection against fake confirmations'],
  },
  {
    id: 'analytics',
    number: '05',
    icon: BarChart3,
    title: 'Business Reporting and Analytics',
    tagline: 'See how the business is really doing.',
    description:
      'Revenue, order, customer, sales and activity reports with date filters, charts and downloadable files, so decisions are based on numbers rather than guesses.',
    features: ['Revenue and sales reports', 'Order and customer reports', 'Activity reports', 'Date filters', 'Charts and trends', 'Downloadable reports'],
    benefits: ['Spot trends early', 'Share reports with partners', 'Decide with confidence'],
  },
  {
    id: 'integration',
    number: '06',
    icon: Plug,
    title: 'Workflow Integration',
    tagline: 'Make your tools talk to each other.',
    description:
      'We connect the systems you already use through APIs, so data syncs automatically between email, payments, customers and orders, and the right people get notified.',
    features: ['API integrations', 'Email integration', 'Payment, customer and order integrations', 'Data synchronisation', 'Notifications'],
    benefits: ['No double entry', 'Always-current data', 'Keep the tools you already like'],
  },
]

export const BENEFITS = [
  { title: 'Save time', text: 'Automate repetitive admin so your team focuses on growth.' },
  { title: 'Fewer errors', text: 'Structured records and checks replace copy-and-paste mistakes.' },
  { title: 'Secure by design', text: 'Role-based access, server-side validation and no exposed secrets.' },
  { title: 'Clear visibility', text: 'Live dashboards and reports show where every project and order stands.' },
  { title: 'Built to grow', text: 'Start with one workflow and add more as the business expands.' },
  { title: 'Local support', text: 'Direct access to the team that built it, by message, email or WhatsApp.' },
]

export const PROCESS = [
  { n: '01', title: 'Submit a request', text: 'Tell us what slows your business down using the request form.' },
  { n: '02', title: 'Review and scope', text: 'We review your request, approve it and agree scope, timeline and cost.' },
  { n: '03', title: 'Build and update', text: 'We build in stages and post progress updates you can follow live.' },
  { n: '04', title: 'Launch and support', text: 'We hand over, train your team and keep improving.' },
]

export const FAQS = [
  { q: 'Do I need technical knowledge?', a: 'No. Describe the problem in plain language. We handle the technical side and explain every step.' },
  { q: 'How long does a project take?', a: 'Small automations can take days; full management systems usually take several weeks. You choose a preferred timeline and we confirm what is realistic.' },
  { q: 'How much does it cost?', a: 'It depends on scope. Pick a budget range on the form; we then send a clear quote before any work begins.' },
  { q: 'Are my payments and data secure?', a: 'Yes. Payments are verified on the server, secret keys are never exposed in the browser, and access is role-based.' },
  { q: 'Can you work with the tools I already use?', a: 'Usually, yes. Our workflow integration service connects existing email, payment and customer tools through APIs.' },
  { q: 'How do I track my project?', a: 'Register, submit your request, then use your client dashboard to see status, progress updates and message the team.' },
  { q: 'What happens after launch?', a: 'We train your team and stay available for fixes and improvements.' },
]
