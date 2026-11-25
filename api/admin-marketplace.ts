import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const ADMIN_UID = '5Rt0Jsf9wdQ8eB8BoWINKTdQPve2'

function getFirebaseAdmin() {
  if (!getApps().length) {
    const serviceAccountValue = process.env.FIREBASE_SERVICE_ACCOUNT

    if (!serviceAccountValue) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is missing')
    }

    const serviceAccount = JSON.parse(serviceAccountValue)

    initializeApp({
      credential: cert(serviceAccount),
    })
  }

  return {
    auth: getAuth(),
    db: getFirestore(),
  }
}

async function verifyAdmin(req: VercelRequest) {
  const authorization = req.headers.authorization

  if (!authorization?.startsWith('Bearer ')) {
    throw new Error('Authentication required')
  }

  const token = authorization.slice(7)
  const { auth } = getFirebaseAdmin()
  const decodedToken = await auth.verifyIdToken(token)

  if (decodedToken.uid !== ADMIN_UID) {
    throw new Error('Administrator access required')
  }

  return decodedToken
}

function sendError(
  res: VercelResponse,
  status: number,
  message: string,
) {
  return res.status(status).json({ error: message })
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.setHeader('Cache-Control', 'no-store')

  try {
    await verifyAdmin(req)

    const { db } = getFirebaseAdmin()

    // GET: Load marketplace administration data.
    if (req.method === 'GET') {
      const [
        storesSnapshot,
        profilesSnapshot,
        ordersSnapshot,
        sellerOrdersSnapshot,
        transactionsSnapshot,
        refundsSnapshot,
        disputesSnapshot,
        settingsSnapshot,
      ] = await Promise.all([
        db.collection('stores').limit(200).get(),
        db.collection('profiles').limit(200).get(),
        db.collection('orders').limit(200).get(),
        db.collection('sellerOrders').limit(200).get(),
        db.collection('transactions').limit(200).get(),
        db.collection('refunds').limit(200).get(),
        db.collection('disputes').limit(200).get(),
        db.collection('settings').doc('marketplace').get(),
      ])

      const serialize = (snapshot: FirebaseFirestore.QuerySnapshot) =>
        snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }))

      return res.status(200).json({
        stores: serialize(storesSnapshot),
        profiles: serialize(profilesSnapshot),
        orders: serialize(ordersSnapshot),
        sellerOrders: serialize(sellerOrdersSnapshot),
        transactions: serialize(transactionsSnapshot),
        refunds: serialize(refundsSnapshot),
        disputes: serialize(disputesSnapshot),
        settings: settingsSnapshot.exists
          ? settingsSnapshot.data()
          : { commissionPercent: 10 },
      })
    }

    // PATCH: Update marketplace settings or management records.
    if (req.method === 'PATCH') {
      const { action, id, status, commissionPercent } = req.body ?? {}

      if (action === 'set-commission') {
        const percentage = Number(commissionPercent)

        if (
          !Number.isFinite(percentage) ||
          percentage < 0 ||
          percentage > 100
        ) {
          return sendError(res, 400, 'Commission must be between 0 and 100')
        }

        await db.collection('settings').doc('marketplace').set(
          {
            commissionPercent: percentage,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )

        return res.status(200).json({
          success: true,
          commissionPercent: percentage,
        })
      }

      if (!id || typeof id !== 'string') {
        return sendError(res, 400, 'A valid record ID is required')
      }

      if (action === 'update-store-status') {
        const allowedStatuses = [
          'Approved',
          'Pending',
          'Rejected',
          'Suspended',
        ]

        if (!allowedStatuses.includes(status)) {
          return sendError(res, 400, 'Invalid store status')
        }

        const storeRef = db.collection('stores').doc(id)
        const storeSnapshot = await storeRef.get()

        if (!storeSnapshot.exists) {
          return sendError(res, 404, 'Store not found')
        }

        await storeRef.update({
          status,
          updatedAt: FieldValue.serverTimestamp(),
        })

        return res.status(200).json({ success: true })
      }

      if (action === 'update-refund-status') {
        const allowedStatuses = [
          'Pending',
          'Under Review',
          'Approved',
          'Rejected',
          'Completed',
        ]

        if (!allowedStatuses.includes(status)) {
          return sendError(res, 400, 'Invalid refund status')
        }

        const refundRef = db.collection('refunds').doc(id)
        const refundSnapshot = await refundRef.get()

        if (!refundSnapshot.exists) {
          return sendError(res, 404, 'Refund case not found')
        }

        await refundRef.update({
          status,
          updatedAt: FieldValue.serverTimestamp(),
        })

        return res.status(200).json({ success: true })
      }

      if (action === 'update-dispute-status') {
        const allowedStatuses = [
          'Open',
          'Under Review',
          'Resolved',
          'Rejected',
        ]

        if (!allowedStatuses.includes(status)) {
          return sendError(res, 400, 'Invalid dispute status')
        }

        const disputeRef = db.collection('disputes').doc(id)
        const disputeSnapshot = await disputeRef.get()

        if (!disputeSnapshot.exists) {
          return sendError(res, 404, 'Dispute case not found')
        }

        await disputeRef.update({
          status,
          updatedAt: FieldValue.serverTimestamp(),
        })

        return res.status(200).json({ success: true })
      }

      return sendError(res, 400, 'Unknown administration action')
    }

    // POST: Create a refund case for an existing order.
    if (req.method === 'POST') {
      const { action, orderId, reason } = req.body ?? {}

      if (action !== 'create-refund') {
        return sendError(res, 400, 'Unknown administration action')
      }

      if (
        typeof orderId !== 'string' ||
        !orderId.trim() ||
        typeof reason !== 'string' ||
        !reason.trim()
      ) {
        return sendError(res, 400, 'Order ID and refund reason are required')
      }

      const orderRef = db.collection('orders').doc(orderId)
      const orderSnapshot = await orderRef.get()

      if (!orderSnapshot.exists) {
        return sendError(res, 404, 'Order not found')
      }

      const order = orderSnapshot.data()!

      if (order.paymentStatus !== 'Paid') {
        return sendError(res, 400, 'Only paid orders can have refund cases')
      }

      const existingRefund = await db
        .collection('refunds')
        .where('orderId', '==', orderId)
        .limit(1)
        .get()

      if (!existingRefund.empty) {
        return sendError(res, 409, 'A refund case already exists for this order')
      }

      const refundRef = await db.collection('refunds').add({
        orderId,
        customerId: order.customerId ?? null,
        customerEmail: order.customerEmail ?? null,
        amount: order.subtotal ?? 0,
        currency: order.currency ?? 'NGN',
        reason: reason.trim(),
        status: 'Pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      return res.status(201).json({
        success: true,
        refundId: refundRef.id,
      })
    }

    res.setHeader('Allow', 'GET, PATCH, POST')
    return sendError(res, 405, 'Method not allowed')
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'

    const status =
      message === 'Authentication required' ||
      message === 'Administrator access required'
        ? 403
        : 500

    return sendError(res, status, message)
  }
}
