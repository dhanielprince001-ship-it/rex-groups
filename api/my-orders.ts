import {
  initializeApp,
  getApps,
  cert,
} from 'firebase-admin/app'

import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

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
    throw new Error('Firebase credentials are missing.')
  }

  return initializeApp({
    credential: cert(JSON.parse(rawCredentials)),
  })
}

function toSeconds(value: unknown): { seconds: number } | null {
  const seconds = (value as { seconds?: unknown } | null)?.seconds

  return typeof seconds === 'number' ? { seconds } : null
}

type PackageSummary = {
  status: string
  paymentStatus: string
}

// The parent order document is never updated after checkout, so its own
// status would say "Awaiting Payment" forever. Derive the buyer-facing
// status from the seller packages instead.
function rollUpPaymentStatus(
  packages: PackageSummary[],
  fallback: string,
) {
  if (packages.length === 0) return fallback

  const paid = packages.filter((p) => p.paymentStatus === 'Paid').length

  if (paid === packages.length) return 'Paid'
  if (paid === 0) return 'Unpaid'

  return 'Partially Paid'
}

function rollUpStatus(packages: PackageSummary[], fallback: string) {
  if (packages.length === 0) return fallback

  const statuses = packages.map((p) => p.status)

  if (statuses.every((status) => status === 'Delivered')) return 'Delivered'

  if (statuses.every((status) => status === 'Awaiting Payment')) {
    return 'Awaiting Payment'
  }

  if (statuses.some((status) => status === 'Shipped' || status === 'Delivered')) {
    return statuses.every((status) => status === 'Shipped' || status === 'Delivered')
      ? 'Shipped'
      : 'Partially Shipped'
  }

  if (statuses.some((status) => status === 'Processing')) return 'Processing'

  return 'Awaiting Fulfilment'
}

// Buyer order tracking: returns only the signed-in customer's own orders,
// each with one "package" per seller. Commission data is never exposed.
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')

    return res.status(405).json({ error: 'Method not allowed.' })
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

    const decodedToken = await getAuth(app).verifyIdToken(
      authorization.slice(7),
    )

    const uid = decodedToken.uid

    const [orderSnapshot, packageSnapshot] = await Promise.all([
      database
        .collection('orders')
        .where('customerId', '==', uid)
        .limit(100)
        .get(),
      database
        .collection('sellerOrders')
        .where('customerId', '==', uid)
        .limit(300)
        .get(),
    ])

    const packagesByOrder = new Map<string, unknown[]>()

    for (const item of packageSnapshot.docs) {
      const data = item.data()
      const orderId = String(data.orderId || '')

      const entry = {
        id: item.id,
        storeName: data.storeName || 'Store',
        sellerId: data.sellerId || '',
        items: Array.isArray(data.items) ? data.items : [],
        subtotal: data.subtotal || 0,
        status: data.status || 'Awaiting Payment',
        paymentStatus: data.paymentStatus || 'Unpaid',
        trackingNumber: data.trackingNumber || '',
        shippingCarrier: data.shippingCarrier || '',
        paidAt: toSeconds(data.paidAt),
        shippedAt: toSeconds(data.shippedAt),
        deliveredAt: toSeconds(data.deliveredAt),
        updatedAt: toSeconds(data.updatedAt),
      }

      const list = packagesByOrder.get(orderId) || []

      list.push(entry)
      packagesByOrder.set(orderId, list)
    }

    const orders = orderSnapshot.docs
      .map((item) => {
        const data = item.data()

        const packages = (packagesByOrder.get(item.id) || []) as PackageSummary[]

        return {
          id: item.id,
          subtotal: data.subtotal || 0,
          deliveryFee:
            typeof data.deliveryFee === 'number' ? data.deliveryFee : null,
          currency: data.currency || 'NGN',
          status: rollUpStatus(packages, data.status || 'Awaiting Payment'),
          paymentStatus: rollUpPaymentStatus(
            packages,
            data.paymentStatus || 'Unpaid',
          ),
          shippingAddress: data.shippingAddress || null,
          createdAt: toSeconds(data.createdAt),
          packages,
        }
      })
      .sort(
        (a, b) =>
          (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
      )

    return res.status(200).json({ success: true, orders })
  } catch (error) {
    console.error('My orders API error:', error)

    return res.status(500).json({
      error: 'Unable to load your orders.',
    })
  }
}
