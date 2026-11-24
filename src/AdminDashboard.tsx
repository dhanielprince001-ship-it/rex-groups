
import { useEffect, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { onAuthStateChanged, type User } from 'firebase/auth'
import {
  ShieldCheck,
  Inbox,
  Clock,
  CheckCircle2,
  RefreshCw,
  BarChart3,
  Activity,
} from 'lucide-react'

import { auth, db } from './firebase'

const ADMIN_UID = '5Rt0Jsf9wdQ8eB8BoWINKTdQPve2'

type Enquiry = {
  id: string
  name: string
  email: string
  business?: string
  message: string
  status?: 'Pending' | 'Contacted' | 'Completed'
  createdAt?: {
    toDate: () => Date
  }
}

function getEnquiryDate(item: Enquiry): Date | null {
  try {
    const date = item.createdAt?.toDate()
    return date && !Number.isNaN(date.getTime()) ? date : null
  } catch {
    return null
  }
}

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState('')

  const isAdmin = user?.uid === ADMIN_UID

  useEffect(() => {
    if (!auth) {
      setUser(null)
      setAuthReady(true)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setAuthReady(true)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!authReady || !isAdmin) {
      setLoading(false)
      setEnquiries([])
      return
    }

    if (!db) {
      setError('Firestore is not initialized. Check your Firebase configuration.')
      setLoading(false)
      return
    }

    const firestore = db

    setLoading(true)
    setError('')

    const enquiriesQuery = query(
      collection(firestore, 'enquiries'),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
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
        console.error('Dashboard error:', err)
        setError('Unable to load enquiries. Check your connection and Firestore rules.')
        setLoading(false)
      },
    )

    return unsubscribe
  }, [authReady, isAdmin])

  async function changeStatus(
    id: string,
    status: Enquiry['status'],
  ) {
    if (!db || !isAdmin || !status) return

    const firestore = db

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
          <a href="#account" className="admin-button">Go to sign in</a>
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

  // Build the last six calendar months.
  const now = new Date()

  const monthlyData = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(
      now.getFullYear(),
      now.getMonth() - (5 - index),
      1,
    )

    const count = enquiries.filter((item) => {
      const enquiryDate = getEnquiryDate(item)

      return enquiryDate &&
        enquiryDate.getMonth() === date.getMonth() &&
        enquiryDate.getFullYear() === date.getFullYear()
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

  const recentEnquiries = enquiries.slice(0, 5)

  return (
    <section className="admin-section" id="admin">
      <div className="section-wrap">

        <div className="admin-heading">
          <div>
            <span className="section-kicker">
              REX GROUPS — CONTROL CENTRE
            </span>
            <h2>
              Admin <em>dashboard.</em>
            </h2>
            <p>
              Welcome, administrator. Monitor and manage your business enquiries.
            </p>
          </div>

          <span className="admin-secure">
            <ShieldCheck size={16} /> Secure access
          </span>
        </div>

        {/* Overview statistics */}
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
        </div>

        {error && (
          <p className="admin-error" role="alert">{error}</p>
        )}

        {loading ? (
          <div className="admin-empty">Loading analytics...</div>
        ) : (
          <>
            {/* Monthly analytics */}
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
                  {monthlyData.map((month) => (
                    <div className="admin-chart-column" key={month.label}>
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

              {/* Recent activity */}
              <div className="admin-analytics-card">
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
                            {getEnquiryDate(item)?.toLocaleString() ||
                              'Date unavailable'}
                          </small>
                        </div>

                        <span
                          className={`admin-status ${(item.status || 'Pending').toLowerCase()}`}
                        >
                          {item.status || 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Enquiry management */}
            <div className="admin-list-heading">
              <div>
                <h3>Customer enquiries</h3>
                <p>
                  Review customer messages and update their progress.
                </p>
              </div>

              <span>{enquiries.length} records</span>
            </div>

            {enquiries.length === 0 ? (
              <div className="admin-empty">
                <Inbox size={30} />
                <h3>No enquiries yet</h3>
                <p>New customer enquiries will appear here.</p>
              </div>
            ) : (
              <div className="admin-enquiry-list">
                {enquiries.map((item) => (
                  <article className="admin-enquiry" key={item.id}>
                    <div className="admin-enquiry-top">
                      <div>
                        <h3>{item.name || 'Unnamed customer'}</h3>

                        <a href={`mailto:${item.email}`}>
                          {item.email}
                        </a>

                        {item.business && <span>{item.business}</span>}
                      </div>

                      <span
                        className={`admin-status ${(item.status || 'Pending').toLowerCase()}`}
                      >
                        {item.status || 'Pending'}
                      </span>
                    </div>

                    <p className="admin-message">{item.message}</p>

                    <div className="admin-enquiry-bottom">
                      <small>
                        {getEnquiryDate(item)?.toLocaleString() ||
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
                              event.target.value as Enquiry['status'],
                            )
                          }
                        >
                          <option value="Pending">Pending</option>
                          <option value="Contacted">Contacted</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
