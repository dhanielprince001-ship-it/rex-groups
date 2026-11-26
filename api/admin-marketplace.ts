import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'

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

// Firestore timestamps do not survive JSON.stringify (they become
// { _seconds }), so convert them to { seconds } for the admin screen.
function plain(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { seconds: (value as Timestamp).seconds }
  }

  if (Array.isArray(value)) {
    return value.map(plain)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, plain(entry)]),
    )
  }

  return value
}

// Releases held money whose auto-release date has passed and that the buyer
// has not disputed. Safe to run many times.
async function releaseDuePayouts(db: FirebaseFirestore.Firestore) {
  const held = await db
    .collection('sellerOrders')
    .where('payoutStatus', '==', 'Held')
    .limit(500)
    .get()

  const nowMs = Date.now()
  let released = 0

  for (const item of held.docs) {
    const due = item.data().autoReleaseAt

    if (!(due instanceof Timestamp) || due.toMillis() > nowMs) continue

    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(item.ref)

      if (fresh.data()?.payoutStatus !== 'Held') return

      tx.update(item.ref, {
        payoutStatus: 'Released',
        payoutReleasedAt: FieldValue.serverTimestamp(),
        payoutReleaseReason: 'Auto-released: buyer did not report a problem',
        updatedAt: FieldValue.serverTimestamp(),
      })
    })

    released++
  }

  return released
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
      await releaseDuePayouts(db)

      const [
        storesSnapshot,
        profilesSnapshot,
        ordersSnapshot,
        sellerOrdersSnapshot,
        transactionsSnapshot,
        refundsSnapshot,
        disputesSnapshot,
        settingsSnapshot,
        verificationsSnapshot,
      ] = await Promise.all([
        db.collection('stores').limit(200).get(),
        db.collection('profiles').limit(200).get(),
        db.collection('orders').limit(200).get(),
        db.collection('sellerOrders').limit(200).get(),
        db.collection('transactions').limit(200).get(),
        db.collection('refunds').limit(200).get(),
        db.collection('disputes').limit(200).get(),
        db.collection('settings').doc('marketplace').get(),
        db.collection('sellerVerifications').limit(200).get(),
      ])

      const serialize = (snapshot: FirebaseFirestore.QuerySnapshot) =>
        snapshot.docs.map((document) => ({
          id: document.id,
          ...(plain(document.data()) as Record<string, unknown>),
        }))

      return res.status(200).json({
        stores: serialize(storesSnapshot),
        profiles: serialize(profilesSnapshot),
        orders: serialize(ordersSnapshot),
        sellerOrders: serialize(sellerOrdersSnapshot),
        transactions: serialize(transactionsSnapshot),
        refunds: serialize(refundsSnapshot),
        disputes: serialize(disputesSnapshot),
        sellerVerifications: serialize(verificationsSnapshot),
        settings: settingsSnapshot.exists
          ? settingsSnapshot.data()
          : { commissionPercent: 10 },
      })
    }

    // PATCH: Update marketplace settings or management records.
    if (req.method === 'PATCH') {
      const body = req.body ?? {}
      const { commissionPercent } = body
      let { action, id, status } = body

      // The admin screen sends short action names; map them here.
      if (action === 'commission') action = 'set-commission'

      if (action === 'storeStatus') {
        action = 'update-store-status'
        id = body.storeId ?? id
      }

      if (action === 'caseStatus') {
        action =
          body.caseType === 'dispute'
            ? 'update-dispute-status'
            : 'update-refund-status'
        id = body.caseId ?? id
      }

      if (action === 'set-require-verified') {
        await db.collection('settings').doc('marketplace').set(
          {
            requireVerifiedSellers: body.value === true,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )

        return res.status(200).json({ success: true })
      }

      // Approve, reject or revoke a seller's identity check.
      if (action === 'verification-review') {
        const storeId = body.storeId
        const decision = body.decision
        const reason =
          typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : ''

        if (typeof storeId !== 'string' || !storeId.trim()) {
          return sendError(res, 400, 'A store is required')
        }

        if (!['approve', 'reject', 'revoke'].includes(decision)) {
          return sendError(res, 400, 'Unknown decision')
        }

        if (decision !== 'approve' && reason.length < 3) {
          return sendError(res, 400, 'Please give a reason')
        }

        const verificationRef = db.collection('sellerVerifications').doc(storeId)
        const storeRef = db.collection('stores').doc(storeId)

        const [verificationSnap, storeSnap] = await Promise.all([
          verificationRef.get(),
          storeRef.get(),
        ])

        if (!verificationSnap.exists || !storeSnap.exists) {
          return sendError(res, 404, 'Verification record not found')
        }

        if (decision === 'approve') {
          await verificationRef.update({
            status: 'Verified',
            rejectionReason: '',
            verifiedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })

          await storeRef.update({
            verified: true,
            verifiedAt: FieldValue.serverTimestamp(),
          })
        } else {
          await verificationRef.update({
            status: 'Rejected',
            rejectionReason: reason,
            updatedAt: FieldValue.serverTimestamp(),
          })

          await storeRef.update({ verified: false })
        }

        return res.status(200).json({ success: true })
      }

      // Money held for a seller order: release it, mark it paid out,
      // hold it again, or cancel it (refund to the buyer).
      if (action === 'payout') {
        const sellerOrderId = body.sellerOrderId
        const operation = body.operation

        if (typeof sellerOrderId !== 'string' || !sellerOrderId.trim()) {
          return sendError(res, 400, 'A seller order is required')
        }

        const reference =
          typeof body.reference === 'string'
            ? body.reference.trim().slice(0, 120)
            : ''

        const ref = db.collection('sellerOrders').doc(sellerOrderId)

        const outcome = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref)

          if (!snap.exists) return 'NOT_FOUND'

          const order = snap.data()!
          const current = order.payoutStatus

          if (order.paymentStatus !== 'Paid') return 'NOT_PAID'

          const base = { updatedAt: FieldValue.serverTimestamp() }

          if (operation === 'release') {
            if (current !== 'Held' && current !== 'Disputed') return 'BAD_STATE'

            tx.update(ref, {
              ...base,
              payoutStatus: 'Released',
              payoutReleasedAt: FieldValue.serverTimestamp(),
              payoutReleaseReason: 'Released by administrator',
            })
          } else if (operation === 'mark-paid') {
            if (current !== 'Released') return 'BAD_STATE'

            tx.update(ref, {
              ...base,
              payoutStatus: 'Paid Out',
              payoutPaidAt: FieldValue.serverTimestamp(),
              payoutReference: reference,
            })
          } else if (operation === 'hold') {
            if (current !== 'Released' && current !== 'Disputed') {
              return 'BAD_STATE'
            }

            tx.update(ref, {
              ...base,
              payoutStatus: 'Held',
              // Clear the countdown so it is not auto-released again.
              autoReleaseAt: FieldValue.delete(),
            })
          } else if (operation === 'cancel') {
            if (current === 'Paid Out' || current === 'Cancelled') {
              return 'BAD_STATE'
            }

            tx.update(ref, {
              ...base,
              payoutStatus: 'Cancelled',
              payoutCancelledAt: FieldValue.serverTimestamp(),
              payoutReleaseReason: 'Cancelled: buyer refunded',
            })
          } else {
            return 'BAD_OPERATION'
          }

          return 'OK'
        })

        if (outcome === 'NOT_FOUND') return sendError(res, 404, 'Seller order not found')
        if (outcome === 'NOT_PAID') return sendError(res, 400, 'Only paid orders have payouts')
        if (outcome === 'BAD_OPERATION') return sendError(res, 400, 'Unknown payout action')
        if (outcome === 'BAD_STATE') {
          return sendError(res, 409, 'That payout is not in a state where this action applies. Refresh and try again.')
        }

        return res.status(200).json({ success: true })
      }

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
          'Requested',
          'Under Review',
          'Approved',
          'Rejected',
          'Processing',
          'Processed',
          'Completed',
          'Failed',
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
          'Evidence Submitted',
          'Resolved',
          'Won',
          'Lost',
          'Rejected',
          'Closed',
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

      if (action !== 'create-refund' && action !== 'createRefundRequest') {
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
        amount: order.total ?? order.subtotal ?? 0,
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
