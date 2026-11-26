import type { VercelRequest, VercelResponse } from '@vercel/node'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { v2 as cloudinary } from 'cloudinary'

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

// Best-effort removal of images from Cloudinary. Never throws: the store is
// already deleted by the time this runs, so a failure here is only reported.
async function deleteCloudinaryImages(publicIds: string[]) {
  const ids = [...new Set(publicIds.filter((id) => typeof id === 'string' && id.trim()))]

  if (ids.length === 0) return { deleted: 0, failed: 0 }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    return { deleted: 0, failed: ids.length }
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret })

  let deleted = 0
  let failed = 0

  // The Cloudinary Admin API accepts up to 100 ids per request.
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100)

    try {
      const result = await cloudinary.api.delete_resources(chunk, { invalidate: true })
      const outcomes = Object.values(result.deleted || {}) as string[]

      deleted += outcomes.filter((value) => value === 'deleted').length
      failed += chunk.length - outcomes.filter((value) => value === 'deleted' || value === 'not_found').length
    } catch (error) {
      console.error('Cloudinary cleanup failed:', error)
      failed += chunk.length
    }
  }

  return { deleted, failed }
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
    const adminToken = await verifyAdmin(req)

    const { db } = getFirebaseAdmin()

    // A permanent record of sensitive admin actions (who, what, why).
    const audit = (
      action: string,
      storeId: string,
      storeName: string,
      reason: string,
      extra: Record<string, unknown> = {},
    ) =>
      db.collection('adminAuditLog').add({
        action,
        storeId,
        storeName,
        reason,
        adminUid: adminToken.uid,
        ...extra,
        createdAt: FieldValue.serverTimestamp(),
      })

    // Products hidden by a store removal remember their earlier status.
    const restoreProducts = async (storeId: string) => {
      const products = await db
        .collection('products')
        .where('storeId', '==', storeId)
        .limit(500)
        .get()

      const batch = db.batch()

      for (const product of products.docs) {
        const data = product.data()

        if (data.removedWithStore === true) {
          batch.update(product.ref, {
            status: data.statusBeforeRemoval || 'Pending',
            removedWithStore: FieldValue.delete(),
            statusBeforeRemoval: FieldValue.delete(),
          })
        }
      }

      await batch.commit()
    }

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

      // Remove a store: hidden everywhere, but all records are kept.
      if (action === 'store-remove') {
        const storeId = body.storeId
        const reason =
          typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''

        if (typeof storeId !== 'string' || !storeId.trim()) {
          return sendError(res, 400, 'A store is required')
        }

        if (reason.length < 5) {
          return sendError(res, 400, 'Please give a reason (at least 5 characters)')
        }

        const storeRef = db.collection('stores').doc(storeId)
        const storeSnap = await storeRef.get()

        if (!storeSnap.exists) return sendError(res, 404, 'Store not found')

        const storeName = String(storeSnap.data()?.name || storeId)

        const sellerOrders = await db
          .collection('sellerOrders')
          .where('sellerId', '==', storeId)
          .limit(500)
          .get()

        // Money not yet paid out to this seller.
        const open = sellerOrders.docs.filter((item) => {
          const data = item.data()
          const payout = data.payoutStatus || (data.paymentStatus === 'Paid' ? 'Held' : '')

          return ['Held', 'Disputed', 'Released'].includes(payout)
        })

        if (open.length > 0 && body.force !== true) {
          return res.status(409).json({
            error: `This store still has ${open.length} payout(s) that are held, disputed or waiting to be paid. Removing the store does not pay or refund them.`,
            needsConfirm: true,
            openPayouts: open.length,
          })
        }

        // Stop held money from being released automatically to a removed store.
        const batch = db.batch()

        for (const item of open) {
          if ((item.data().payoutStatus || 'Held') === 'Held') {
            batch.update(item.ref, {
              autoReleaseAt: FieldValue.delete(),
              holdReason: 'Store removed by administrator',
              updatedAt: FieldValue.serverTimestamp(),
            })
          }
        }

        const products = await db
          .collection('products')
          .where('storeId', '==', storeId)
          .limit(450)
          .get()

        for (const product of products.docs) {
          const data = product.data()

          if (data.removedWithStore === true) continue

          batch.update(product.ref, {
            statusBeforeRemoval: data.status || 'Pending',
            status: 'Suspended',
            removedWithStore: true,
          })
        }

        batch.update(storeRef, {
          status: 'Removed',
          verified: false,
          removedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })

        await batch.commit()

        await audit('store-remove', storeId, storeName, reason, {
          openPayouts: open.length,
        })

        return res.status(200).json({ success: true })
      }

      // Bring a removed store back, with its products.
      if (action === 'store-restore') {
        const storeId = body.storeId

        if (typeof storeId !== 'string' || !storeId.trim()) {
          return sendError(res, 400, 'A store is required')
        }

        const storeRef = db.collection('stores').doc(storeId)
        const storeSnap = await storeRef.get()

        if (!storeSnap.exists) return sendError(res, 404, 'Store not found')

        if (storeSnap.data()?.status !== 'Removed') {
          return sendError(res, 400, 'This store has not been removed')
        }

        await restoreProducts(storeId)

        await storeRef.update({
          status: 'Suspended',
          updatedAt: FieldValue.serverTimestamp(),
        })

        await audit('store-restore', storeId, String(storeSnap.data()?.name || storeId), 'Restored (set to Suspended; reactivate when ready)')

        return res.status(200).json({ success: true })
      }

      // Permanently delete a store that has never had an order.
      if (action === 'store-delete') {
        const storeId = body.storeId
        const confirmName = typeof body.confirmName === 'string' ? body.confirmName.trim() : ''
        const reason =
          typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''

        if (typeof storeId !== 'string' || !storeId.trim()) {
          return sendError(res, 400, 'A store is required')
        }

        const storeRef = db.collection('stores').doc(storeId)
        const storeSnap = await storeRef.get()

        if (!storeSnap.exists) return sendError(res, 404, 'Store not found')

        const storeName = String(storeSnap.data()?.name || storeId)

        if (confirmName.toLowerCase() !== storeName.toLowerCase()) {
          return sendError(res, 400, 'Type the exact store name to confirm')
        }

        const history = await db
          .collection('sellerOrders')
          .where('sellerId', '==', storeId)
          .limit(1)
          .get()

        if (!history.empty) {
          return sendError(
            res,
            409,
            'This store has order history, so it can only be removed, not deleted.',
          )
        }

        const [products, ratings] = await Promise.all([
          db.collection('products').where('storeId', '==', storeId).limit(450).get(),
          db.collection('storeRatings').where('storeId', '==', storeId).limit(450).get(),
        ])

        // Collect image ids before the records are gone.
        const storeData = storeSnap.data() || {}
        const imageIds: string[] = [
          storeData.logoPublicId,
          storeData.coverPublicId,
          ...products.docs.map((item) => item.data().publicId),
        ].filter((id): id is string => typeof id === 'string' && id.trim() !== '')

        const batch = db.batch()

        products.docs.forEach((item) => batch.delete(item.ref))
        ratings.docs.forEach((item) => batch.delete(item.ref))
        batch.delete(db.collection('sellerVerifications').doc(storeId))
        batch.delete(storeRef)

        await batch.commit()

        const images = await deleteCloudinaryImages(imageIds)

        await audit('store-delete', storeId, storeName, reason || 'Deleted permanently', {
          productsDeleted: products.size,
          imagesDeleted: images.deleted,
          imagesFailed: images.failed,
        })

        return res.status(200).json({
          success: true,
          imagesDeleted: images.deleted,
          imagesFailed: images.failed,
        })
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

        const previousStatus = storeSnapshot.data()?.status

        await storeRef.update({
          status,
          updatedAt: FieldValue.serverTimestamp(),
        })

        if (previousStatus === 'Removed') {
          await restoreProducts(id)
        }

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
