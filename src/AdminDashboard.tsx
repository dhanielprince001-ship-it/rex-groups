
import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import {
  ShieldCheck,
  Inbox,
  Clock,
  CheckCircle2,
  RefreshCw,
  BarChart3,
  Activity,
  Users,
  Search,
  Mail,
  Calendar,
  Download,
  FileText,
  Filter,
  X,
} from 'lucide-react'

import { db } from './firebase'
import { useAuth } from './AuthPanel'

const ADMIN_UID = '5Rt0Jsf9wdQ8eB8BoWINKTdQPve2'

type EnquiryStatus = 'Pending' | 'Contacted' | 'Completed'
type FilterStatus = 'All' | EnquiryStatus

type Enquiry = {
  id: string
  name: string
  email: string
  business?: string
  message: string
  status?: EnquiryStatus
  createdAt?: {
    toDate: () => Date
  }
}

type Customer = {
  id: string
  uid: string
  name?: string
  email?: string
  photoURL?: string
  provider?: string
  createdAt?: {
    toDate: () => Date
  }
  lastSignInAt?: {
    toDate: () => Date
  }
}

function safeDate(value?: { toDate: () => Date }): Date | null {
  try {
    const date = value?.toDate()
    return date && !Number.isNaN(date.getTime()) ? date : null
  } catch {
    return null
  }
}

function formatDate(value?: { toDate: () => Date }) {
  return safeDate(value)?.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }) || '—'
}

function escapeCSV(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCSV(enquiries: Enquiry[]) {
  const headings = [
    'Customer',
    'Email',
    'Business',
    'Message',
    'Status',
    'Date',
  ]

  const rows = enquiries.map((item) => [
    item.name,
    item.email,
    item.business || 'General enquiry',
    item.message,
    item.status || 'Pending',
    safeDate(item.createdAt)?.toISOString() || '',
  ])

  const csv = [
    headings.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n')

  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `rex-groups-enquiries-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`

  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function AdminDashboard() {
  const { user, ready: authReady } = useAuth()

  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])

  const [loading, setLoading] = useState(true)
  const [customersLoading, setCustomersLoading] = useState(true)

  const [error, setError] = useState('')
  const [updating, setUpdating] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [enquirySearch, setEnquirySearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('All')

  const isAdmin = user?.uid === ADMIN_UID

  // Filter enquiries (must stay above the early returns below: Rules of Hooks)
  const filteredEnquiries = useMemo(() => {
    const search = enquirySearch.trim().toLowerCase()

    return enquiries.filter((item) => {
      const matchesStatus =
        statusFilter === 'All' ||
        (item.status || 'Pending') === statusFilter

      const matchesSearch =
        !search ||
        (item.name || '').toLowerCase().includes(search) ||
        (item.email || '').toLowerCase().includes(search) ||
        (item.business || '').toLowerCase().includes(search) ||
        (item.message || '').toLowerCase().includes(search)

      return matchesStatus && matchesSearch
    })
  }, [enquiries, enquirySearch, statusFilter])

  // Load enquiries and customer profiles
  useEffect(() => {
    if (!authReady || !isAdmin) {
      setLoading(false)
      setCustomersLoading(false)
      setEnquiries([])
      setCustomers([])
      return
    }

    const firestore = db

    if (!firestore) {
      setError('Firestore is not initialized. Check Firebase configuration.')
      setLoading(false)
      setCustomersLoading(false)
      return
    }

    setLoading(true)
    setCustomersLoading(true)
    setError('')

    const enquiriesQuery = query(
      collection(firestore, 'enquiries'),
      orderBy('createdAt', 'desc'),
    )

    const profilesQuery = query(
      collection(firestore, 'profiles'),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribeEnquiries = onSnapshot(
      enquiriesQuery,
      (snapshot) => {
        setEnquiries(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as Enquiry[],
        )
        setLoading(false)
      },
      (err) => {
        console.error('Enquiries error:', err)
        setError('Unable to load enquiries. Check Firestore rules.')
        setLoading(false)
      },
    )

    const unsubscribeCustomers = onSnapshot(
      profilesQuery,
      (snapshot) => {
        setCustomers(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as Customer[],
        )
        setCustomersLoading(false)
      },
      (err) => {
        console.error('Customer profiles error:', err)
        setError('Unable to load customers. Check your profiles collection rules.')
        setCustomersLoading(false)
      },
    )

    return () => {
      unsubscribeEnquiries()
      unsubscribeCustomers()
    }
  }, [authReady, isAdmin])

  // Update enquiry status
  async function changeStatus(id: string, status: EnquiryStatus) {
    const firestore = db

    if (!firestore || !isAdmin) return

    setUpdating(id)
    setError('')

    try {
      await updateDoc(doc(firestore, 'enquiries', id), {
        status,
        updatedAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('Status update failed:', err)
      setError('Could not update this enquiry. Please try again.')
    } finally {
      setUpdating('')
    }
  }

  // Authentication loading
  if (!authReady) {
    return (
      <section className="admin-section" id="admin">
        <div className="admin-card">Checking administrator access...</div>
      </section>
    )
  }

  // Signed-out users
  if (!user) {
    return (
      <section className="admin-section" id="admin">
        <div className="admin-card admin-locked">
          <ShieldCheck size={34} />
          <h2>Administrator access</h2>
          <p>Please sign in with your administrator account to continue.</p>
          <a href="#account" className="admin-button">Go to sign in</a>
        </div>
      </section>
    )
  }

  // Non-administrators
  if (!isAdmin) {
    return (
      <section className="admin-section" id="admin">
        <div className="admin-card admin-locked">
          <ShieldCheck size={34} />
          <h2>Access restricted</h2>
          <p>This account does not have administrator permission.</p>
        </div>
      </section>
    )
  }

  // Statistics
  const pending = enquiries.filter(
    (item) => (item.status || 'Pending') === 'Pending',
  ).length

  const contacted = enquiries.filter(
    (item) => item.status === 'Contacted',
  ).length

  const completed = enquiries.filter(
    (item) => item.status === 'Completed',
  ).length

  const completionRate = enquiries.length
    ? Math.round((completed / enquiries.length) * 100)
    : 0

  // Six-month analytics
  const now = new Date()

  const monthlyData = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(
      now.getFullYear(),
      now.getMonth() - (5 - index),
      1,
    )

    const count = enquiries.filter((item) => {
      const enquiryDate = safeDate(item.createdAt)

      return (
        enquiryDate &&
        enquiryDate.getMonth() === date.getMonth() &&
        enquiryDate.getFullYear() === date.getFullYear()
      )
    }).length

    return {
      label: date.toLocaleDateString('en', { month: 'short' }),
      count,
    }
  })

  const maxMonthlyCount = Math.max(
    ...monthlyData.map((item) => item.count),
    1,
  )

  // Customer search
  const filteredCustomers = customers.filter((customer) => {
    const search = customerSearch.trim().toLowerCase()

    if (!search) return true

    return (
      (customer.name || '').toLowerCase().includes(search) ||
      (customer.email || '').toLowerCase().includes(search) ||
      customer.id.toLowerCase().includes(search)
    )
  })

  const recentEnquiries = enquiries.slice(0, 5)

  // Print business report
  function printReport() {
    window.print()
  }

  return (
    <section className="admin-section" id="admin">
      <div className="section-wrap">

        <div className="admin-heading">
          <div>
            <span className="section-kicker">
              REX GROUPS — CONTROL CENTRE
            </span>
            <h2>Admin <em>dashboard.</em></h2>
            <p>Monitor customers, business enquiries and activity.</p>
          </div>

          <span className="admin-secure">
            <ShieldCheck size={16} /> Secure access
          </span>
        </div>

        {error && (
          <p className="admin-error" role="alert">{error}</p>
        )}

        {/* Report actions */}
        <div className="admin-report-actions">
          <button
            type="button"
            className="admin-button"
            onClick={() => downloadCSV(filteredEnquiries)}
            disabled={filteredEnquiries.length === 0}
          >
            <Download size={17} />
            Export enquiries CSV
          </button>

          <button
            type="button"
            className="admin-button"
            onClick={printReport}
          >
            <FileText size={17} />
            Print business report
          </button>
        </div>

        {/* Statistics */}
        <div className="admin-stats">
          <div className="admin-stat">
            <Inbox size={22} />
            <span>Total enquiries</span>
            <strong>{enquiries.length}</strong>
          </div>

          <div className="admin-stat">
            <Clock size={22} />
            <span>Pending</span>
            <strong>{pending}</strong>
          </div>

          <div className="admin-stat">
            <RefreshCw size={22} />
            <span>Contacted</span>
            <strong>{contacted}</strong>
          </div>

          <div className="admin-stat">
            <CheckCircle2 size={22} />
            <span>Completed</span>
            <strong>{completed}</strong>
          </div>

          <div className="admin-stat">
            <Users size={22} />
            <span>Customers</span>
            <strong>{customers.length}</strong>
          </div>
        </div>

        {/* Performance */}
        <div className="admin-analytics-grid">
          <div className="admin-analytics-card">
            <div className="admin-analytics-heading">
              <div>
                <span className="section-kicker">PERFORMANCE</span>
                <h3>Enquiry overview</h3>
                <p>Enquiries received over the last six months.</p>
              </div>
              <BarChart3 size={24} />
            </div>

            <div className="admin-chart">
              {monthlyData.map((month, index) => (
                <div className="admin-chart-column" key={`${month.label}-${index}`}>
                  <strong>{month.count}</strong>
                  <div className="admin-chart-track">
                    <div
                      className="admin-chart-bar"
                      style={{
                        height: `${Math.max(
                          (month.count / maxMonthlyCount) * 100,
                          month.count > 0 ? 8 : 0,
                        )}%`,
                      }}
                    />
                  </div>
                  <span>{month.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-analytics-card">
            <div className="admin-analytics-heading">
              <div>
                <span className="section-kicker">BUSINESS RESULTS</span>
                <h3>Completion rate</h3>
                <p>Percentage of enquiries marked completed.</p>
              </div>
              <Activity size={24} />
            </div>

            <div className="admin-completion">
              <strong>{completionRate}%</strong>
              <div className="admin-completion-track">
                <div
                  className="admin-completion-bar"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
              <p>{completed} completed out of {enquiries.length} enquiries.</p>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="admin-analytics-card admin-recent-card">
          <div className="admin-analytics-heading">
            <div>
              <span className="section-kicker">LATEST UPDATES</span>
              <h3>Recent activity</h3>
              <p>Your five latest customer enquiries.</p>
            </div>
            <Activity size={24} />
          </div>

          {recentEnquiries.length === 0 ? (
            <div className="admin-recent-empty">
              No recent activity yet.
            </div>
          ) : (
            <div className="admin-recent-list">
              {recentEnquiries.map((item) => (
                <div className="admin-recent-item" key={item.id}>
                  <div className="admin-recent-icon">
                    <Inbox size={17} />
                  </div>
                  <div className="admin-recent-info">
                    <strong>{item.name || 'Unnamed customer'}</strong>
                    <span>{item.email}</span>
                    <small>
                      {safeDate(item.createdAt)?.toLocaleString() ||
                        'Date unavailable'}
                    </small>
                  </div>
                  <span className={`admin-status ${(item.status || 'Pending').toLowerCase()}`}>
                    {item.status || 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Customers */}
        <div className="admin-list-heading">
          <div>
            <span className="section-kicker">CUSTOMER DIRECTORY</span>
            <h3>Registered customers</h3>
            <p>View and search customer accounts registered with Rex Groups.</p>
          </div>
          <span>{customers.length} customers</span>
        </div>

        <div className="admin-customer-search">
          <Search size={19} />
          <input
            type="search"
            placeholder="Search by customer name, email or ID..."
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
            aria-label="Search customers"
          />
          {customerSearch && (
            <button
              type="button"
              onClick={() => setCustomerSearch('')}
              aria-label="Clear customer search"
            >
              <X size={17} />
            </button>
          )}
        </div>

        {customersLoading ? (
          <div className="admin-empty">Loading customer profiles...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="admin-empty">
            <Users size={30} />
            <h3>No customers found</h3>
            <p>
              {customerSearch
                ? 'Try another search term.'
                : 'Registered customers will appear here.'}
            </p>
          </div>
        ) : (
          <div className="admin-customer-list">
            {filteredCustomers.map((customer) => (
              <article className="admin-customer" key={customer.id}>
                <div className="admin-customer-profile">
                  {customer.photoURL ? (
                    <img
                      src={customer.photoURL}
                      alt=""
                      className="admin-customer-avatar"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="admin-customer-avatar admin-customer-initial">
                      {(customer.name || customer.email || 'C')
                        .charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="admin-customer-info">
                    <h3>{customer.name || 'Unnamed customer'}</h3>
                    <a href={`mailto:${customer.email || ''}`}>
                      <Mail size={14} />
                      {customer.email || 'No email available'}
                    </a>
                    <span>
                      {customer.provider === 'google.com'
                        ? 'Google account'
                        : customer.provider === 'password'
                          ? 'Email and password'
                          : customer.provider || 'Unknown provider'}
                    </span>
                  </div>
                </div>

                <div className="admin-customer-dates">
                  <span>
                    <Calendar size={14} />
                    Joined: {formatDate(customer.createdAt)}
                  </span>
                  <small>
                    Last sign-in: {formatDate(customer.lastSignInAt)}
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Enquiry management */}
        <div className="admin-list-heading">
          <div>
            <span className="section-kicker">INBOX MANAGEMENT</span>
            <h3>Customer enquiries</h3>
            <p>Search messages, filter by status and update progress.</p>
          </div>
          <span>{filteredEnquiries.length} of {enquiries.length} records</span>
        </div>

        <div className="admin-enquiry-tools">
          <div className="admin-customer-search">
            <Search size={19} />
            <input
              type="search"
              placeholder="Search name, email, business or message..."
              value={enquirySearch}
              onChange={(event) => setEnquirySearch(event.target.value)}
              aria-label="Search enquiries"
            />
            {enquirySearch && (
              <button
                type="button"
                onClick={() => setEnquirySearch('')}
                aria-label="Clear enquiry search"
              >
                <X size={17} />
              </button>
            )}
          </div>

          <label className="admin-filter">
            <Filter size={17} />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as FilterStatus)
              }
              aria-label="Filter enquiries by status"
            >
              <option value="All">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Contacted">Contacted</option>
              <option value="Completed">Completed</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="admin-empty">Loading enquiries...</div>
        ) : filteredEnquiries.length === 0 ? (
          <div className="admin-empty">
            <Inbox size={30} />
            <h3>No enquiries found</h3>
            <p>Try changing your search or status filter.</p>
          </div>
        ) : (
          <div className="admin-enquiry-list">
            {filteredEnquiries.map((item) => (
              <article className="admin-enquiry" key={item.id}>
                <div className="admin-enquiry-top">
                  <div>
                    <h3>{item.name || 'Unnamed customer'}</h3>
                    <a href={`mailto:${item.email}`}>{item.email}</a>
                    {item.business && <span>{item.business}</span>}
                  </div>

                  <span className={`admin-status ${(item.status || 'Pending').toLowerCase()}`}>
                    {item.status || 'Pending'}
                  </span>
                </div>

                <p className="admin-message">{item.message}</p>

                <div className="admin-enquiry-bottom">
                  <small>
                    {safeDate(item.createdAt)?.toLocaleString() ||
                      'Date unavailable'}
                  </small>

                  <label>
                    Status
                    <select
                      value={item.status || 'Pending'}
                      disabled={updating === item.id}
                      onChange={(event) =>
                        changeStatus(
                          item.id,
                          event.target.value as EnquiryStatus,
                        )
                      }
                    >
                      <option value="Pending">Pending</option>
                      <option value="Contacted">Contacted</option>
                      <option value="Completed">Completed</option>
                    </select>
                    {updating === item.id && <small>Saving...</small>}
                  </label>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
