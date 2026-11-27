
import {
  initializeApp,
  getApps,
  cert,
} from 'firebase-admin/app'

import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

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
    return statuses.every(
      (status) => status === 'Shipped' || status === 'Delivered',
    )
      ? 'Shipped'
      : 'Partially Shipped'
  }

  if (statuses.some((status) => status === 'Processing')) return 'Processing'

  return 'Awaiting Fulfilment'
}

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

    // BUYER RESPONSE: confirm receipt (releases payout) or report a problem.
    if (req.method === 'POST') {
      const body = (req.body && typeof req.body === 'object'
        ? req.body
        : {}) as Record<string, unknown>

      const sellerOrderId =
        typeof body.sellerOrderId === 'string' ? body.sellerOrderId.trim() : ''
      const action = body.action
      const reason =
        typeof body.reason === 'string' ? body.reason.trim() : ''

      if (!sellerOrderId || sellerOrderId.length > 150) {
        return res.status(400).json({ error: 'A valid order is required.' })
      }

      if (action !== 'confirm' && action !== 'dispute') {
        return res.status(400).json({ error: 'Invalid action.' })
      }

      if (action === 'dispute' && (reason.length < 10 || reason.length > 500)) {
        return res.status(400).json({
          error: 'Please describe the problem in 10 to 500 characters.',
        })
      }

      const orderRef = database.collection('sellerOrders').doc(sellerOrderId)

      const outcome = await database.runTransaction(async (tx) => {
        const snap = await tx.get(orderRef)

        if (!snap.exists) return 'NOT_FOUND'

        const order = snap.data()!

        // Only the buyer who placed this order may respond.
        if (order.customerId !== uid) return 'NOT_FOUND'
        if (order.paymentStatus !== 'Paid') return 'NOT_PAID'
        if (order.status !== 'Shipped' && order.status !== 'Delivered') {
          return 'NOT_SHIPPED'
        }

        const payout = order.payoutStatus || 'Held'

        if (payout !== 'Held') return payout === 'Disputed' ? 'DISPUTED' : 'DONE'

        const now = FieldValue.serverTimestamp()

        if (action === 'confirm') {
          const patch: Record<string, unknown> = {
            status: 'Delivered',
            payoutStatus: 'Released',
            payoutReleasedAt: now,
            payoutReleaseReason: 'Confirmed by buyer: package received',
            buyerConfirmedAt: now,
            autoReleaseAt: FieldValue.delete(),
            updatedAt: now,
          }

          if (!order.deliveredAt) patch.deliveredAt = now

          tx.update(orderRef, patch)
        } else {
          tx.update(orderRef, {
            payoutStatus: 'Disputed',
            disputeReason: reason,
            disputedAt: now,
            autoReleaseAt: FieldValue.delete(),
            updatedAt: now,
          })
        }

        return 'OK'
      })

      const messages: Record<string, [number, string]> = {
        NOT_FOUND: [404, 'Order not found.'],
        NOT_PAID: [400, 'This order has not been paid.'],
        NOT_SHIPPED: [400, 'You can respond once the order has been shipped.'],
        DONE: [400, 'You have already confirmed this order.'],
        DISPUTED: [400, 'A problem was already reported for this order.'],
      }

      if (outcome !== 'OK') {
        const [status, error] = messages[outcome] || [400, 'Could not update this order.']
        return res.status(status).json({ error })
      }

      return res.status(200).json({ success: true })
    }

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
        deliveryFee:
          typeof data.deliveryFee === 'number'
            ? data.deliveryFee
            : 0,
        deliveryLocation: data.deliveryLocation || '',
        status: data.status || 'Awaiting Payment',
        paymentStatus: data.paymentStatus || 'Unpaid',
        trackingNumber: data.trackingNumber || '',
        shippingCarrier: data.shippingCarrier || '',
        paidAt: toSeconds(data.paidAt),
        processingAt: toSeconds(data.processingAt),
        shippedAt: toSeconds(data.shippedAt),
        deliveredAt: toSeconds(data.deliveredAt),
        updatedAt: toSeconds(data.updatedAt),
        payoutStatus:
          data.payoutStatus === 'Disputed'
            ? 'Disputed'
            : ['Released', 'Paid Out'].includes(data.payoutStatus)
              ? 'Released'
              : 'Held',
        autoReleaseAt: toSeconds(data.autoReleaseAt),
      }

      const list = packagesByOrder.get(orderId) || []

      list.push(entry)
      packagesByOrder.set(orderId, list)
    }

    const orders = orderSnapshot.docs
      .map((item) => {
        const data = item.data()

        const packages = (
          packagesByOrder.get(item.id) || []
        ) as PackageSummary[]

        return {
          id: item.id,
          subtotal: data.subtotal || 0,
          deliveryFee:
            typeof data.deliveryFee === 'number'
              ? data.deliveryFee
              : null,
          total:
            typeof data.total === 'number'
              ? data.total
              : null,
          currency: data.currency || 'NGN',
          status: rollUpStatus(
            packages,
            data.status || 'Awaiting Payment',
          ),
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
          (b.createdAt?.seconds || 0) -
          (a.createdAt?.seconds || 0),
      )

    return res.status(200).json({
      success: true,
      orders,
    })
  } catch (error) {
    console.error('My orders API error:', error)

    return res.status(500).json({
      error: 'Unable to load your orders.',
    })
  }
}
