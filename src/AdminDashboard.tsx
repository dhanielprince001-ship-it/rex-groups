import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection,
  deleteDoc,
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
  Send,
  Phone,
  Star,
  MessageSquare,
  Trash2,
  Edit3,
} from 'lucide-react'

import { db } from './firebase'
import { useAuth } from './AuthPanel'
import { EMAILJS_PUBLIC_KEY, EMAILJS_SERVICE_ID } from './siteConfig'
import AdminMarketplaceManagement from './AdminMarketplaceManagement'

const ADMIN_UID = '5Rt0Jsf9wdQ8eB8BoWINKTdQPve2'

// EmailJS configuration
const EMAILJS_REPLY_TEMPLATE_ID = 'template_e2pq1x7'

type EnquiryStatus = 'Pending' | 'Contacted' | 'Completed'
type FilterStatus = 'All' | EnquiryStatus

type Enquiry = {
  id: string
  name: string
  email: string
  phone?: string
  business?: string
  customerType?: string
  service?: string
  source?: string
  message: string
  status?: EnquiryStatus
  createdAt?: { toDate: () => Date }
}

type Customer = {
  id: string
  uid: string
  name?: string
  email?: string
  photoURL?: string
  provider?: string
  createdAt?: { toDate: () => Date }
  lastSignInAt?: { toDate: () => Date }
}

type ReviewStatus = 'Pending' | 'Approved' | 'Rejected'

type Review = {
  id: string
  name: string
  email: string
  rating: number
  comment: string
  status: ReviewStatus
  adminReply?: string
  adminReplyAt?: { toDate: () => Date }
  createdAt?: { toDate: () => Date }
}

type StoreStatus = 'Pending' | 'Approved' | 'Rejected' | 'Suspended'

type Store = {
  id: string
  ownerId: string
  ownerName: string
  name: string
  description: string
  category: string
  status: StoreStatus
  createdAt?: { toDate: () => Date }
  updatedAt?: { toDate: () => Date }
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
  return (
    safeDate(value)?.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }) || '—'
  )
}

function escapeCSV(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCSV(enquiries: Enquiry[]) {
  const headings = [
    'Customer',
    'Email',
    'Phone',
    'Business',
    'Customer Type',
    'Service',
    'Source',
    'Message',
    'Status',
    'Date',
  ]

  const rows = enquiries.map((item) => [
    item.name,
    item.email,
    item.phone || 'Not provided',
    item.business || 'General enquiry',
    item.customerType || '',
    item.service || '',
    item.source || '',
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
  const [reviews, setReviews] = useState<Review[]>([])
  const [stores, setStores] = useState<Store[]>([])

  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [storesLoading, setStoresLoading] = useState(true)

  const [reviewFilter, setReviewFilter] = useState<ReviewStatus | 'All'>('All')
  const [loading, setLoading] = useState(true)
  const [customersLoading, setCustomersLoading] = useState(true)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [updating, setUpdating] = useState('')

  const [customerSearch, setCustomerSearch] = useState('')
  const [enquirySearch, setEnquirySearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('All')

  const [replyingTo, setReplyingTo] = useState('')
  const [replyMessage, setReplyMessage] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  const [replyingToReview, setReplyingToReview] = useState('')
  const [reviewReplyMessage, setReviewReplyMessage] = useState('')
  const [savingReviewReply, setSavingReviewReply] = useState(false)

  const isAdmin = user?.uid === ADMIN_UID

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
        (item.phone || '').toLowerCase().includes(search) ||
        (item.business || '').toLowerCase().includes(search) ||
        (item.customerType || '').toLowerCase().includes(search) ||
        (item.service || '').toLowerCase().includes(search) ||
        (item.source || '').toLowerCase().includes(search) ||
        (item.message || '').toLowerCase().includes(search)

      return matchesStatus && matchesSearch
    })
  }, [enquiries, enquirySearch, statusFilter])

  useEffect(() => {
    if (!authReady || !isAdmin) {
      setLoading(false)
      setCustomersLoading(false)
      setReviewsLoading(false)
      setStoresLoading(false)

      setEnquiries([])
      setCustomers([])
      setReviews([])
      setStores([])

      return
    }

    const firestore = db

    if (!firestore) {
      setError('Firestore is not initialized. Check Firebase configuration.')

      setLoading(false)
      setCustomersLoading(false)
      setReviewsLoading(false)
      setStoresLoading(false)

      return
    }

    setLoading(true)
    setCustomersLoading(true)
    setReviewsLoading(true)
    setStoresLoading(true)
    setError('')

    const enquiriesQuery = query(
      collection(firestore, 'enquiries'),
      orderBy('createdAt', 'desc'),
    )

    const profilesQuery = query(
      collection(firestore, 'profiles'),
      orderBy('createdAt', 'desc'),
    )

    const reviewsQuery = query(
      collection(firestore, 'reviews'),
      orderBy('createdAt', 'desc'),
    )

    const storesQuery = query(
      collection(firestore, 'stores'),
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

    const unsubscribeReviews = onSnapshot(
      reviewsQuery,
      (snapshot) => {
        setReviews(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as Review[],
        )

        setReviewsLoading(false)
      },
      (err) => {
        console.error('Reviews error:', err)
        setError('Unable to load customer reviews. Check your reviews rules.')
        setReviewsLoading(false)
      },
    )

    const unsubscribeStores = onSnapshot(
      storesQuery,
      (snapshot) => {
        setStores(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })) as Store[],
        )

        setStoresLoading(false)
      },
      (err) => {
        console.error('Stores error:', err)
        setError('Unable to load store applications. Check your Firestore rules.')
        setStoresLoading(false)
      },
    )

    return () => {
      unsubscribeEnquiries()
      unsubscribeCustomers()
      unsubscribeReviews()
      unsubscribeStores()
    }
  }, [authReady, isAdmin])

  async function changeStatus(id: string, status: EnquiryStatus) {
    const firestore = db
    if (!firestore || !isAdmin) return

    setUpdating(id)
    setError('')
    setSuccess('')

    try {
      await updateDoc(doc(firestore, 'enquiries', id), {
        status,
        updatedAt: serverTimestamp(),
      })

      setSuccess('Enquiry status updated successfully.')
    } catch (err) {
      console.error('Status update failed:', err)
      setError('Could not update this enquiry. Please try again.')
    } finally {
      setUpdating('')
    }
  }

  async function changeReviewStatus(id: string, status: ReviewStatus) {
    const firestore = db
    if (!firestore || !isAdmin) return

    setUpdating(id)
    setError('')
    setSuccess('')

    try {
      await updateDoc(doc(firestore, 'reviews', id), {
        status,
        updatedAt: serverTimestamp(),
      })

      setSuccess(`Review marked as ${status.toLowerCase()}.`)
    } catch (err) {
      console.error('Review update failed:', err)
      setError('Could not update this review. Please try again.')
    } finally {
      setUpdating('')
    }
  }

  async function changeStoreStatus(id: string, status: StoreStatus) {
    const firestore = db

    if (!firestore || !isAdmin) {
      setError('Administrator permission is required.')
      return
    }

    setUpdating(id)
    setError('')
    setSuccess('')

    try {
      await updateDoc(doc(firestore, 'stores', id), {
        status,
        updatedAt: serverTimestamp(),
      })

      setSuccess(`Store successfully marked as ${status.toLowerCase()}.`)
    } catch (err) {
      console.error('Store status update failed:', err)
      setError('Could not update this store. Please try again.')
    } finally {
      setUpdating('')
    }
  }

  async function removeReview(id: string) {
    const firestore = db
    if (!firestore || !isAdmin) return

    if (!window.confirm('Delete this review permanently?')) return

    setUpdating(id)
    setError('')
    setSuccess('')

    try {
      await deleteDoc(doc(firestore, 'reviews', id))
      setSuccess('Review deleted.')
    } catch (err) {
      console.error('Review delete failed:', err)
      setError('Could not delete this review. Please try again.')
    } finally {
      setUpdating('')
    }
  }

  async function saveReviewReply(review: Review) {
    const firestore = db
    const message = reviewReplyMessage.trim()

    if (!firestore || !isAdmin) {
      setError('Administrator permission is required.')
      return
    }

    if (review.status !== 'Approved') {
      setError('Only approved reviews can receive public replies.')
      return
    }

    if (!message) {
      setError('Please write a reply before publishing.')
      return
    }

    if (message.length > 1000) {
      setError('Your reply must be 1,000 characters or fewer.')
      return
    }

    setSavingReviewReply(true)
    setError('')
    setSuccess('')

    try {
      await updateDoc(doc(firestore, 'reviews', review.id), {
        adminReply: message,
        adminReplyAt: serverTimestamp(),
      })

      setSuccess('Your company reply has been published.')
      setReplyingToReview('')
      setReviewReplyMessage('')
    } catch (err) {
      console.error('Review reply failed:', err)
      setError('Could not publish the reply. Please try again.')
    } finally {
      setSavingReviewReply(false)
    }
  }

  async function removeReviewReply(id: string) {
    const firestore = db
    if (!firestore || !isAdmin) return

    if (!window.confirm('Remove this company reply?')) return

    setUpdating(id)
    setError('')
    setSuccess('')

    try {
      await updateDoc(doc(firestore, 'reviews', id), {
        adminReply: '',
        adminReplyAt: null,
      })

      setSuccess('Company reply removed.')
    } catch (err) {
      console.error('Removing review reply failed:', err)
      setError('Could not remove the company reply.')
    } finally {
      setUpdating('')
    }
  }

  async function sendCustomerReply(item: Enquiry) {
    const message = replyMessage.trim()

    if (!isAdmin) {
      setError('Administrator permission is required.')
      return
    }

    if (!item.email) {
      setError('This customer does not have an email address.')
      return
    }

    if (!message) {
      setError('Please write a message before sending.')
      return
    }

    setSendingReply(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(
        'https://api.emailjs.com/api/v1.0/email/send',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_REPLY_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY,
            template_params: {
              to_email: item.email,
              to_name: item.name || 'Customer',
              subject: 'Response to your enquiry — Rex Groups',
              message,
              reply_to: 'rexgroups.uk@gmail.com',
              business: item.business || 'General enquiry',
            },
          }),
        },
      )

      if (!response.ok) {
        const responseText = await response.text()
        throw new Error(responseText || 'Email could not be sent.')
      }

      const firestore = db

      if (firestore) {
        await updateDoc(doc(firestore, 'enquiries', item.id), {
          status: 'Contacted',
          updatedAt: serverTimestamp(),
          lastReplyAt: serverTimestamp(),
        })
      }

      setSuccess(`Your reply was sent to ${item.email}.`)
      setReplyMessage('')
      setReplyingTo('')
    } catch (err) {
      console.error('Customer reply failed:', err)
      setError('Unable to send the reply. Check your EmailJS template and settings.')
    } finally {
      setSendingReply(false)
    }
  }

  if (!authReady) {
    return (
      <section className="admin-section" id="admin">
        <div className="admin-card">Checking administrator access...</div>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="admin-section" id="admin">
        <div className="admin-card admin-locked">
          <ShieldCheck size={34} />
          <h2>Administrator access</h2>
          <p>Please sign in with your administrator account to continue.</p>
          <Link to="/#account" className="admin-button">Go to sign in</Link>
        </div>
      </section>
    )
  }

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

  const pendingStores = stores.filter(
    (store) => store.status === 'Pending',
  ).length

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

  const filteredReviews = reviews.filter(
    (review) =>
      reviewFilter === 'All' ||
      (review.status || 'Pending') === reviewFilter,
  )

  const pendingReviews = reviews.filter(
    (review) => (review.status || 'Pending') === 'Pending',
  ).length

  function printReport() {
    window.print()
  }

  return (
    <section className="admin-section" id="admin">
      <div className="section-wrap">
        <div className="admin-heading">
          <div>
            <span className="section-kicker">REX GROUPS — CONTROL CENTRE</span>
            <h2>Admin <em>dashboard.</em></h2>
            <p>Monitor customers, business enquiries and activity.</p>
          </div>

          <span className="admin-secure">
            <ShieldCheck size={16} />
            Secure access
          </span>
        </div>

        {error && <p className="admin-error" role="alert">{error}</p>}
        {success && <p className="admin-success" role="status">{success}</p>}

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

          <button type="button" className="admin-button" onClick={printReport}>
            <FileText size={17} />
            Print business report
          </button>
        </div>

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

        {/* Store applications */}
        <div className="admin-list-heading">
          <div>
            <span className="section-kicker">MARKETPLACE MANAGEMENT</span>
            <h3>Store applications</h3>
            <p>Review seller applications and manage approved stores.</p>
          </div>

          <span>
            {pendingStores} pending · {stores.length} total
          </span>
        </div>

        {storesLoading ? (
          <div className="admin-empty">Loading store applications...</div>
        ) : stores.length === 0 ? (
          <div className="admin-empty">
            <Inbox size={30} />
            <h3>No store applications yet</h3>
            <p>New seller applications will appear here.</p>
          </div>
        ) : (
          <div className="admin-enquiry-list">
            {stores.map((store) => {
              const status = store.status || 'Pending'

              return (
                <article className="admin-enquiry" key={store.id}>
                  <div className="admin-enquiry-top">
                    <div>
                      <h3>{store.name || 'Unnamed store'}</h3>
                      <span>Owner: {store.ownerName || 'Unknown seller'}</span>
                      <span>Category: {store.category || 'Not specified'}</span>
                      <span>Store ID: {store.id}</span>
                    </div>

                    <span className={`admin-status ${status.toLowerCase()}`}>
                      {status}
                    </span>
                  </div>

                  <p className="admin-message">
                    {store.description || 'No store description provided.'}
                  </p>

                  <div className="admin-enquiry-bottom">
                    <small>Applied: {formatDate(store.createdAt)}</small>

                    <div className="admin-report-actions">
                      <button
                        type="button"
                        className="admin-button"
                        onClick={() => changeStoreStatus(store.id, 'Approved')}
                        disabled={updating === store.id || status === 'Approved'}
                      >
                        <CheckCircle2 size={16} />
                        Approve
                      </button>

                      <button
                        type="button"
                        className="admin-button"
                        onClick={() => changeStoreStatus(store.id, 'Rejected')}
                        disabled={updating === store.id || status === 'Rejected'}
                      >
                        <X size={16} />
                        Reject
                      </button>

                      <button
                        type="button"
                        className="admin-button"
                        onClick={() => changeStoreStatus(store.id, 'Suspended')}
                        disabled={updating === store.id || status === 'Suspended'}
                      >
                        <ShieldCheck size={16} />
                        Suspend
                      </button>
                    </div>
                  </div>

                  {updating === store.id && (
                    <small>Updating store status...</small>
                  )}
                </article>
              )
            })}
          </div>
        )}

        {/* NEW: Full marketplace administration */}
        <AdminMarketplaceManagement />

        {/* Analytics */}
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
            <div className="admin-recent-empty">No recent activity yet.</div>
          ) : (
            <div className="admin-recent-list">
              {recentEnquiries.map((item) => (
                <div className="admin-recent-item" key={item.id}>
                  <div className="admin-recent-icon"><Inbox size={17} /></div>
                  <div className="admin-recent-info">
                    <strong>{item.name || 'Unnamed customer'}</strong>
                    <span>{item.email}</span>
                    {item.phone && <span>{item.phone}</span>}
                    <small>
                      {safeDate(item.createdAt)?.toLocaleString() || 'Date unavailable'}
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

        {/* Customer directory */}
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
            <p>{customerSearch ? 'Try another search term.' : 'Registered customers will appear here.'}</p>
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
                      {(customer.name || customer.email || 'C').charAt(0).toUpperCase()}
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
                  <span><Calendar size={14} /> Joined: {formatDate(customer.createdAt)}</span>
                  <small>Last sign-in: {formatDate(customer.lastSignInAt)}</small>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Review moderation */}
        <div className="admin-list-heading">
          <div>
            <span className="section-kicker">REVIEW MODERATION</span>
            <h3>Customer reviews</h3>
            <p>Approve reviews and publish official Rex Groups replies.</p>
          </div>
          <span>{pendingReviews} pending · {reviews.length} total</span>
        </div>

        <div className="admin-enquiry-tools">
          <label className="admin-filter">
            <Filter size={17} />
            <select
              value={reviewFilter}
              onChange={(event) => setReviewFilter(event.target.value as ReviewStatus | 'All')}
              aria-label="Filter reviews by status"
            >
              <option value="All">All reviews</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
          </label>
        </div>

        {reviewsLoading ? (
          <div className="admin-empty">Loading reviews...</div>
        ) : filteredReviews.length === 0 ? (
          <div className="admin-empty">
            <Star size={30} />
            <h3>No reviews found</h3>
            <p>Customer reviews will appear here for approval.</p>
          </div>
        ) : (
          <div className="admin-enquiry-list">
            {filteredReviews.map((review) => {
              const status = review.status || 'Pending'
              const isEditingReply = replyingToReview === review.id

              return (
                <article className="admin-enquiry" key={review.id}>
                  <div className="admin-enquiry-top">
                    <div>
                      <h3>{review.name || 'Customer'}</h3>
                      <a href={`mailto:${review.email}`}>{review.email}</a>
                      <span>Rating: {review.rating} / 5</span>
                    </div>
                    <span className={`admin-status ${status.toLowerCase()}`}>
                      {status}
                    </span>
                  </div>

                  <p className="admin-message">{review.comment}</p>

                  {review.adminReply && (
                    <div className="admin-company-reply">
                      <strong><MessageSquare size={16} /> Rex Groups response</strong>
                      <p>{review.adminReply}</p>
                      <small>
                        {safeDate(review.adminReplyAt)?.toLocaleString() || 'Published reply'}
                      </small>
                    </div>
                  )}

                  {status === 'Approved' && (
                    <div className="admin-review-reply-area">
                      {isEditingReply ? (
                        <div className="admin-reply-box">
                          <div className="admin-reply-heading">
                            <strong>
                              {review.adminReply ? 'Edit company reply' : 'Write company reply'}
                            </strong>
                            <button
                              type="button"
                              className="admin-button"
                              onClick={() => {
                                setReplyingToReview('')
                                setReviewReplyMessage('')
                              }}
                              disabled={savingReviewReply}
                              aria-label="Close reply editor"
                            >
                              <X size={16} />
                            </button>
                          </div>

                          <textarea
                            value={reviewReplyMessage}
                            onChange={(event) => setReviewReplyMessage(event.target.value)}
                            placeholder="Write an official response from Rex Groups..."
                            rows={4}
                            maxLength={1000}
                            disabled={savingReviewReply}
                          />

                          <small>{reviewReplyMessage.length}/1000 characters</small>

                          <button
                            type="button"
                            className="admin-button"
                            onClick={() => saveReviewReply(review)}
                            disabled={savingReviewReply || !reviewReplyMessage.trim()}
                          >
                            <Send size={16} />
                            {savingReviewReply ? 'Publishing...' : 'Publish Reply'}
                          </button>
                        </div>
                      ) : (
                        <div className="admin-report-actions">
                          <button
                            type="button"
                            className="admin-button"
                            onClick={() => {
                              setReplyingToReview(review.id)
                              setReviewReplyMessage(review.adminReply || '')
                              setError('')
                              setSuccess('')
                            }}
                          >
                            {review.adminReply ? <Edit3 size={16} /> : <MessageSquare size={16} />}
                            {review.adminReply ? 'Edit company reply' : 'Write company reply'}
                          </button>

                          {review.adminReply && (
                            <button
                              type="button"
                              className="admin-button"
                              onClick={() => removeReviewReply(review.id)}
                              disabled={updating === review.id}
                            >
                              <Trash2 size={16} />
                              Remove reply
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="admin-enquiry-bottom">
                    <small>
                      {safeDate(review.createdAt)?.toLocaleString() || 'Date unavailable'}
                    </small>

                    <div className="admin-report-actions">
                      <button
                        type="button"
                        className="admin-button"
                        onClick={() => changeReviewStatus(review.id, 'Approved')}
                        disabled={updating === review.id || status === 'Approved'}
                      >
                        <CheckCircle2 size={16} />
                        Approve
                      </button>

                      <button
                        type="button"
                        className="admin-button"
                        onClick={() => changeReviewStatus(review.id, 'Rejected')}
                        disabled={updating === review.id || status === 'Rejected'}
                      >
                        <X size={16} />
                        Reject
                      </button>

                      <button
                        type="button"
                        className="admin-button"
                        onClick={() => removeReview(review.id)}
                        disabled={updating === review.id}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {/* Enquiry management */}
        <div className="admin-list-heading">
          <div>
            <span className="section-kicker">INBOX MANAGEMENT</span>
            <h3>Customer enquiries</h3>
            <p>Search messages, reply to customers and update progress.</p>
          </div>
          <span>{filteredEnquiries.length} of {enquiries.length} records</span>
        </div>

        <div className="admin-enquiry-tools">
          <div className="admin-customer-search">
            <Search size={19} />
            <input
              type="search"
              placeholder="Search name, email, phone, business or message..."
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
              onChange={(event) => setStatusFilter(event.target.value as FilterStatus)}
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

                    {item.phone ? (
                      <a href={`tel:${item.phone}`} className="admin-customer-phone">
                        <Phone size={15} />
                        {item.phone}
                      </a>
                    ) : (
                      <span>Phone number not provided</span>
                    )}

                    {item.business && <span>Business: {item.business}</span>}
                    {item.customerType && <span>Customer type: {item.customerType}</span>}
                    {item.service && <span>Service: {item.service}</span>}
                    {item.source && <span>Source: {item.source}</span>}
                  </div>

                  <span className={`admin-status ${(item.status || 'Pending').toLowerCase()}`}>
                    {item.status || 'Pending'}
                  </span>
                </div>

                <p className="admin-message">{item.message}</p>

                {replyingTo === item.id ? (
                  <div className="admin-reply-box">
                    <div className="admin-reply-heading">
                      <strong>Reply to {item.name || 'customer'}</strong>
                      <button
                        type="button"
                        className="admin-button"
                        onClick={() => {
                          setReplyingTo('')
                          setReplyMessage('')
                        }}
                        disabled={sendingReply}
                        aria-label="Close reply"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <p>To: {item.email}</p>

                    <textarea
                      value={replyMessage}
                      onChange={(event) => setReplyMessage(event.target.value)}
                      placeholder="Write your response to this customer..."
                      rows={5}
                      disabled={sendingReply}
                    />

                    <button
                      type="button"
                      className="admin-button"
                      onClick={() => sendCustomerReply(item)}
                      disabled={sendingReply || !replyMessage.trim()}
                    >
                      <Send size={16} />
                      {sendingReply ? 'Sending reply...' : 'Send email reply'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="admin-button"
                    onClick={() => {
                      setReplyingTo(item.id)
                      setReplyMessage('')
                      setError('')
                      setSuccess('')
                    }}
                    disabled={!item.email}
                  >
                    <Mail size={16} />
                    Reply to customer
                  </button>
                )}

                <div className="admin-enquiry-bottom">
                  <small>
                    {safeDate(item.createdAt)?.toLocaleString() || 'Date unavailable'}
                  </small>

                  <label>
                    Status
                    <select
                      value={item.status || 'Pending'}
                      disabled={updating === item.id}
                      onChange={(event) =>
                        changeStatus(item.id, event.target.value as EnquiryStatus)
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
