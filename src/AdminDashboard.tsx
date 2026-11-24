
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

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState('')

  const isAdmin = user?.uid === ADMIN_UID

  // Safely monitor Firebase authentication
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

  // Load enquiries only for the administrator
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
        setError(
          'Unable to load enquiries. Check your connection and Firestore rules.',
        )
        setLoading(false)
      },
    )

    return unsubscribe
  }, [authReady, isAdmin])

  // Update an enquiry's status
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
        <div className="admin-card">
          Checking administrator access...
        </div>
      </section>
    )
  }

  if (!user) {
    return (
      <section className="admin-section" id="admin">
        <div className="admin-card admin-locked">
          <ShieldCheck size={34} />
          <h2>Administrator access</h2>
          <p>
            Please sign in with your administrator account to continue.
          </p>
          <a href="#account" className="admin-button">
            Go to sign in
          </a>
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
          <p>
            This account does not have administrator permission.
          </p>
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
              Welcome, administrator. Manage your business enquiries here.
            </p>
          </div>

          <span className="admin-secure">
            <ShieldCheck size={16} /> Secure access
          </span>
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
        </div>

        <div className="admin-list-heading">
          <div>
            <h3>Customer enquiries</h3>
            <p>
              Messages submitted through your website contact form.
            </p>
          </div>

          <span>{enquiries.length} records</span>
        </div>

        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <div className="admin-empty">
            Loading enquiries...
          </div>
        ) : enquiries.length === 0 ? (
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

                    {item.business && (
                      <span>{item.business}</span>
                    )}
                  </div>

                  <span
                    className={`admin-status ${(item.status || 'Pending').toLowerCase()}`}
                  >
                    {item.status || 'Pending'}
                  </span>
                </div>

                <p className="admin-message">
                  {item.message}
                </p>

                <div className="admin-enquiry-bottom">
                  <small>
                    {item.createdAt?.toDate
                      ? item.createdAt.toDate().toLocaleString()
                      : 'Date unavailable'}
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
      </div>
    </section>
  )
}
