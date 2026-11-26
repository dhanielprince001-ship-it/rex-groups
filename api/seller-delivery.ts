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

import { randomBytes } from 'node:crypto'

import type {
  VercelRequest,
  VercelResponse,
} from '@vercel/node'

const MAX_ZONES = 40
const MAX_FEE = 1_000_000

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

// Lets an approved seller save their delivery price list.
// PUT { zones: [{ id?, location, fee }] } replaces the whole list.
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT')

    return res.status(405).json({
      error: 'Method not allowed.',
    })
  }

  try {
    const authorization = req.headers.authorization

    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Please sign in to continue.',
      })
    }

    const app = getFirebaseAdmin()
    const database = getFirestore(app)

    const decoded = await getAuth(app).verifyIdToken(
      authorization.slice(7),
    )

    const sellerId = decoded.uid
    const storeRef = database.collection('stores').doc(sellerId)
    const storeSnap = await storeRef.get()

    if (!storeSnap.exists || storeSnap.data()?.ownerId !== sellerId) {
      return res.status(403).json({
        error: 'You do not have a store.',
      })
    }

    if (storeSnap.data()?.status !== 'Approved') {
      return res.status(403).json({
        error: 'Your store must be approved before you can set delivery prices.',
      })
    }

    const rawZones = req.body?.zones

    if (!Array.isArray(rawZones) || rawZones.length > MAX_ZONES) {
      return res.status(400).json({
        error: `You can save up to ${MAX_ZONES} delivery locations.`,
      })
    }

    const zones: Array<{ id: string; location: string; fee: number }> = []
    const seenNames = new Set<string>()
    const seenIds = new Set<string>()

    for (const entry of rawZones) {
      const location =
        typeof entry?.location === 'string'
          ? entry.location.trim().replace(/\s+/g, ' ')
          : ''

      const fee = Number(entry?.fee)

      if (location.length < 2 || location.length > 80) {
        return res.status(400).json({
          error: 'Each location needs a name between 2 and 80 characters.',
        })
      }

      if (
        !Number.isFinite(fee) ||
        fee < 0 ||
        fee > MAX_FEE
      ) {
        return res.status(400).json({
          error: `The delivery price for ${location} must be between ₦0 and ₦${MAX_FEE.toLocaleString('en-NG')}.`,
        })
      }

      const key = location.toLowerCase()

      if (seenNames.has(key)) {
        return res.status(400).json({
          error: `${location} is listed more than once.`,
        })
      }

      seenNames.add(key)

      // Keep existing ids so a seller editing a price does not break
      // carts that already picked that location.
      let id =
        typeof entry?.id === 'string' &&
        /^[A-Za-z0-9_-]{1,40}$/.test(entry.id) &&
        !seenIds.has(entry.id)
          ? entry.id
          : randomBytes(8).toString('hex')

      while (seenIds.has(id)) {
        id = randomBytes(8).toString('hex')
      }

      seenIds.add(id)

      zones.push({
        id,
        location,
        fee: Math.round(fee * 100) / 100,
      })
    }

    await storeRef.update({
      deliveryZones: zones,
      deliveryUpdatedAt: FieldValue.serverTimestamp(),
    })

    return res.status(200).json({
      success: true,
      zones,
    })
  } catch (error) {
    console.error('Delivery price save error:', error)

    return res.status(500).json({
      error: 'Unable to save your delivery prices. Please try again.',
    })
  }
}
