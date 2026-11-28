
import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthPanel'
import { ADMIN_UID } from './types'

export type StaffRole = '' | 'support' | 'manager' | 'admin'

export const ROLE_LEVEL: Record<StaffRole, number> = { '': 0, support: 1, manager: 2, admin: 3 }

// Reads the signed-in person's staff role. The server re-checks it on every action,
// so this only decides which screens and buttons are shown.
export function useStaffRole(): { role: StaffRole; level: number; loading: boolean } {
  const { user, ready } = useAuth()
  const [role, setRole] = useState<StaffRole>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!ready) return

      if (!user) {
        setRole('')
        setLoading(false)
        return
      }

      if (user.uid === ADMIN_UID) {
        setRole('admin')
        setLoading(false)
        return
      }

      try {
        if (!db) throw new Error('offline')
        const snap = await getDoc(doc(db, 'staff', user.uid))
        const data = snap.data()
        const next: StaffRole =
          snap.exists() && data?.active !== false && (data?.role === 'manager' || data?.role === 'support')
            ? (data.role as StaffRole)
            : ''
        if (!cancelled) setRole(next)
      } catch {
        if (!cancelled) setRole('')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [user, ready])

  return { role, level: ROLE_LEVEL[role], loading }
}
