
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
    throw new Error('Firebase credentials are missing.')
  }

  return initializeApp({
    credential: cert(JSON.parse(rawCredentials)),
  })
}

function validText(value: unknown, maxLength: number) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  )
}

const allowedStatuses = [
  'Processing',
  'Shipped',
  'Delivered',
]

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET' && req.method !== 'PATCH') {
    res.setHeader('Allow', 'GET, PATCH')

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
    const auth = getAuth(app)
    const database = getFirestore(app)

    const decodedToken = await auth.verifyIdToken(
      authorization.slice(7),
    )

    const sellerId = decodedToken.uid

    // GET: Retrieve only this seller's orders.
    if (req.method === 'GET') {
      const snapshot = await database
        .collection('sellerOrders')
        .where('sellerId', '==', sellerId)
        .limit(100)
        .get()

      const orders = snapshot.docs.map((order) => ({
        id: order.id,
        ...order.data(),
      }))

      orders.sort((a, b) => {
        const first =
          (a.createdAt as { seconds?: number })?.seconds || 0

        const second =
          (b.createdAt as { seconds?: number })?.seconds || 0

        return second - first
      })

      return res.status(200).json({
        success: true,
        orders,
      })
    }

    // PATCH: Update fulfilment information.
    const body = req.body || {}

    const sellerOrderId = body.sellerOrderId
    const newStatus = body.status
    const trackingNumber = body.trackingNumber || ''
    const shippingCarrier = body.shippingCarrier || ''

    if (!validText(sellerOrderId, 150)) {
      return res.status(400).json({
        error: 'A valid seller order ID is required.',
      })
    }

    if (!allowedStatuses.includes(newStatus)) {
      return res.status(400).json({
        error: 'Invalid fulfilment status.',
      })
    }

    if (
      typeof trackingNumber !== 'string' ||
      trackingNumber.length > 100 ||
      typeof shippingCarrier !== 'string' ||
      shippingCarrier.length > 100
    ) {
      return res.status(400).json({
        error: 'Invalid shipping information.',
      })
    }

    const orderRef = database
      .collection('sellerOrders')
      .doc(sellerOrderId)

    const result = await database.runTransaction(
      async (transaction) => {
        const orderSnapshot = await transaction.get(orderRef)

        if (!orderSnapshot.exists) {
          throw new Error('ORDER_NOT_FOUND')
        }

        const order = orderSnapshot.data()!

        // Sellers can only update their own orders.
        if (order.sellerId !== sellerId) {
          throw new Error('NOT_ORDER_OWNER')
        }

        // Sellers cannot change payment status.
        if (order.paymentStatus !== 'Paid') {
          throw new Error('PAYMENT_NOT_CONFIRMED')
        }

        const currentStatus = order.status

        const validTransition =
          (currentStatus === 'Awaiting Fulfilment' &&
            newStatus === 'Processing') ||
          (currentStatus === 'Processing' &&
            newStatus === 'Shipped') ||
          (currentStatus === 'Shipped' &&
            newStatus === 'Delivered')

        if (!validTransition) {
          throw new Error('INVALID_STATUS_TRANSITION')
        }

        if (newStatus === 'Shipped' && !trackingNumber.trim()) {
          throw new Error('TRACKING_REQUIRED')
        }

        const updateData: Record<string, unknown> = {
          status: newStatus,
          updatedAt: FieldValue.serverTimestamp(),
        }

        if (newStatus === 'Shipped') {
          updateData.trackingNumber = trackingNumber.trim()
          updateData.shippingCarrier = shippingCarrier.trim()
          updateData.shippedAt = FieldValue.serverTimestamp()
        }

        if (newStatus === 'Delivered') {
          updateData.deliveredAt = FieldValue.serverTimestamp()
        }

        transaction.update(orderRef, updateData)

        return {
          id: orderSnapshot.id,
          status: newStatus,
          trackingNumber:
            newStatus === 'Shipped'
              ? trackingNumber.trim()
              : order.trackingNumber || '',
        }
      },
    )

    return res.status(200).json({
      success: true,
      message: 'Order updated successfully.',
      order: result,
    })
  } catch (error) {
    if (error instanceof Error) {
      const messages: Record<string, {
        status: number
        message: string
      }> = {
        ORDER_NOT_FOUND: {
          status: 404,
          message: 'Order not found.',
        },
        NOT_ORDER_OWNER: {
          status: 403,
          message: 'You cannot update another seller’s order.',
        },
        PAYMENT_NOT_CONFIRMED: {
          status: 403,
          message: 'This order cannot be processed until payment is confirmed.',
        },
        INVALID_STATUS_TRANSITION: {
          status: 400,
          message: 'This order cannot move to that status.',
        },
        TRACKING_REQUIRED: {
          status: 400,
          message: 'Enter a tracking number before marking an order as shipped.',
        },
      }

      const knownError = messages[error.message]

      if (knownError) {
        return res.status(knownError.status).json({
          error: knownError.message,
        })
      }
    }

    console.error('Seller orders API error:', error)

    return res.status(500).json({
      error: 'Unable to process your order request.',
    })
  }
}
