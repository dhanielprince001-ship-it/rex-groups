import {
  initializeApp,
  getApps,
  cert,
} from 'firebase-admin/app'

import { getAuth } from 'firebase-admin/auth'

import {
  getFirestore,
  FieldValue,
} from 'firebase-admin/firestore'

import type {
  VercelRequest,
  VercelResponse,
} from '@vercel/node'

function getFirebaseAdmin() {
  if (getApps().length) {
    return getApps()[0]
  }

  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT

  if (!rawCredentials) {
    throw new Error('Firebase credentials are missing')
  }

  return initializeApp({
    credential: cert(JSON.parse(rawCredentials)),
  })
}

// "Chidi Okafor" -> "Chidi O." so reviews do not expose full names.
function publicName(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'Customer'

  const parts = value.trim().split(/\s+/)

  if (parts.length === 1) return parts[0].slice(0, 30)

  return `${parts[0].slice(0, 30)} ${parts[parts.length - 1][0]}.`
}

async function getSignedInUid(
  req: VercelRequest,
  app: ReturnType<typeof getFirebaseAdmin>,
) {
  const authorization = req.headers.authorization

  if (!authorization?.startsWith('Bearer ')) return null

  try {
    const decoded = await getAuth(app).verifyIdToken(
      authorization.slice(7),
    )

    return decoded.uid
  } catch {
    return null
  }
}

// A customer may rate a store once they have received an order from it.
async function hasDeliveredOrder(
  database: ReturnType<typeof getFirestore>,
  uid: string,
  storeId: string,
) {
  const snapshot = await database
    .collection('sellerOrders')
    .where('customerId', '==', uid)
    .where('sellerId', '==', storeId)
    .limit(50)
    .get()

  return snapshot.docs.some(
    (item) => item.data().status === 'Delivered',
  )
}

// GET  /api/store-ratings?storeId=...  -> public reviews (+ canRate when signed in)
// POST /api/store-ratings { storeId, rating, comment } -> save or update my rating
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')

    return res.status(405).json({
      error: 'Method not allowed.',
    })
  }

  try {
    const app = getFirebaseAdmin()
    const database = getFirestore(app)

    if (req.method === 'GET') {
      const storeId = req.query.storeId

      if (typeof storeId !== 'string' || !storeId.trim()) {
        return res.status(400).json({
          error: 'A store is required.',
        })
      }

      const storeSnap = await database
        .collection('stores')
        .doc(storeId)
        .get()

      if (!storeSnap.exists || storeSnap.data()?.status !== 'Approved') {
        return res.status(404).json({
          error: 'Store not found.',
        })
      }

      const ratingSnap = await database
        .collection('storeRatings')
        .where('storeId', '==', storeId)
        .limit(200)
        .get()

      const reviews = ratingSnap.docs
        .map((item) => {
          const data = item.data()

          return {
            id: item.id,
            customerId: String(data.customerId || ''),
            rating: Number(data.rating) || 0,
            comment:
              typeof data.comment === 'string' ? data.comment : '',
            customerName: publicName(data.customerName),
            createdAt: data.createdAt?.seconds ?? 0,
          }
        })
        .sort((a, b) => b.createdAt - a.createdAt)

      const uid = await getSignedInUid(req, app)

      let canRate = false
      let myRating: { rating: number; comment: string } | null = null

      if (uid && uid !== storeId) {
        canRate = await hasDeliveredOrder(database, uid, storeId)

        const mine = reviews.find((entry) => entry.customerId === uid)

        if (mine) {
          myRating = { rating: mine.rating, comment: mine.comment }
        }
      }

      const store = storeSnap.data()!

      return res.status(200).json({
        success: true,
        average:
          typeof store.ratingAverage === 'number'
            ? store.ratingAverage
            : 0,
        count:
          typeof store.ratingCount === 'number'
            ? store.ratingCount
            : 0,
        canRate,
        myRating,
        // Never send customer ids to the browser.
        reviews: reviews.slice(0, 50).map((entry) => ({
          id: entry.id,
          rating: entry.rating,
          comment: entry.comment,
          customerName: entry.customerName,
          createdAt: entry.createdAt,
        })),
      })
    }

    // POST
    const uid = await getSignedInUid(req, app)

    if (!uid) {
      return res.status(401).json({
        error: 'Please sign in to rate this store.',
      })
    }

    const body = req.body || {}
    const storeId = body.storeId
    const rating = Number(body.rating)

    const comment =
      typeof body.comment === 'string' ? body.comment.trim() : ''

    if (typeof storeId !== 'string' || !storeId.trim()) {
      return res.status(400).json({
        error: 'A store is required.',
      })
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        error: 'Please choose a rating from 1 to 5 stars.',
      })
    }

    if (comment.length > 500) {
      return res.status(400).json({
        error: 'Your review can be up to 500 characters.',
      })
    }

    if (uid === storeId) {
      return res.status(403).json({
        error: 'You cannot rate your own store.',
      })
    }

    if (!(await hasDeliveredOrder(database, uid, storeId))) {
      return res.status(403).json({
        error: 'You can rate a store after you have received an order from it.',
      })
    }

    const userRecord = await getAuth(app).getUser(uid)

    const storeRef = database.collection('stores').doc(storeId)
    const ratingRef = database
      .collection('storeRatings')
      .doc(`${storeId}_${uid}`)

    const result = await database.runTransaction(async (tx) => {
      const storeSnap = await tx.get(storeRef)
      const existing = await tx.get(ratingRef)

      if (!storeSnap.exists || storeSnap.data()?.status !== 'Approved') {
        throw new Error('STORE_UNAVAILABLE')
      }

      const store = storeSnap.data()!

      let sum = Number(store.ratingSum) || 0
      let count = Number(store.ratingCount) || 0

      if (existing.exists) {
        // Changing an earlier rating: swap the old value for the new one.
        sum = sum - (Number(existing.data()?.rating) || 0) + rating
      } else {
        sum += rating
        count += 1
      }

      const average = count > 0 ? Math.round((sum / count) * 10) / 10 : 0

      tx.set(
        ratingRef,
        {
          storeId,
          customerId: uid,
          customerName: userRecord.displayName || '',
          rating,
          comment,
          createdAt: existing.exists
            ? existing.data()?.createdAt ?? FieldValue.serverTimestamp()
            : FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      )

      tx.update(storeRef, {
        ratingSum: sum,
        ratingCount: count,
        ratingAverage: average,
      })

      return { average, count }
    })

    return res.status(200).json({
      success: true,
      average: result.average,
      count: result.count,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'STORE_UNAVAILABLE') {
      return res.status(404).json({
        error: 'This store is not available.',
      })
    }

    console.error('Store rating error:', error)

    return res.status(500).json({
      error: 'Unable to process your request. Please try again.',
    })
  }
}
