
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
  refundStatus?: string
  refundedAmount?: number
  total?: number
}

function rollUpPaymentStatus(
  packages: PackageSummary[],
  fallback: string,
) {
  if (packages.length === 0) return fallback

  const refunded = packages.filter((p) => p.refundStatus === 'Refunded').length
  const anyRefund = packages.some((p) => (p.refundedAmount || 0) > 0)

  if (refunded === packages.length) return 'Refunded'
  if (anyRefund) return 'Partially Refunded'

  const paid = packages.filter((p) => p.paymentStatus === 'Paid').length

  if (paid === packages.length) return 'Paid'
  if (paid === 0) return 'Unpaid'

  return 'Partially Paid'
}

function rollUpStatus(packages: PackageSummary[], fallback: string) {
  if (packages.length === 0) return fallback

  if (packages.every((p) => p.refundStatus === 'Refunded')) return 'Refunded'

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


// Best-effort email via Resend. Never throws. Skipped when not configured.
async function sendMail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY
  const from = process.env.BDS_NOTIFY_FROM

  if (!key || !from || !to) return

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
    })
  } catch (error) {
    console.error('Email failed:', error)
  }
}
const SITE = process.env.APP_BASE_URL || 'https://rex-groups.vercel.app'

// ---------- DISPUTE CONVERSATION (buyer, seller and admin) ----------
type DisputeDb = ReturnType<typeof getFirestore>
type DisputeRole = 'buyer' | 'seller' | 'admin'
const DISPUTE_MAX_MESSAGES = 200

async function readDisputeThread(db: DisputeDb, orderId: string) {
  const snap = await db
    .collection('sellerOrders')
    .doc(orderId)
    .collection('disputeMessages')
    .orderBy('createdAt', 'asc')
    .limit(DISPUTE_MAX_MESSAGES)
    .get()

  return snap.docs.map((document) => {
    const x = document.data()

    return {
      id: document.id,
      role: String(x.role || ''),
      authorName: String(x.authorName || ''),
      text: String(x.text || ''),
      createdAt:
        x.createdAt && typeof x.createdAt.seconds === 'number'
          ? (x.createdAt.seconds as number)
          : 0,
    }
  })
}

// Returns an error message, or '' when the message was saved.
async function addDisputeMessage(
  db: DisputeDb,
  orderId: string,
  order: Record<string, unknown>,
  role: DisputeRole,
  authorName: string,
  rawText: unknown,
): Promise<string> {
  const text = typeof rawText === 'string' ? rawText.trim() : ''

  if (text.length < 1 || text.length > 1000) {
    return 'Write a message of 1 to 1000 characters.'
  }

  const payout = String(order.payoutStatus || 'Held')

  if (!order.disputeReason || !['Disputed', 'Held'].includes(payout)) {
    return 'This dispute is closed.'
  }

  const ref = db.collection('sellerOrders').doc(orderId)
  const total = (await ref.collection('disputeMessages').count().get()).data().count

  if (total >= DISPUTE_MAX_MESSAGES) {
    return 'This conversation has reached its message limit. Please contact Rex Groups.'
  }

  await ref.collection('disputeMessages').add({
    role,
    authorName: authorName.slice(0, 80) || role,
    text,
    createdAt: FieldValue.serverTimestamp(),
  })

  await ref.update({
    disputeUpdatedAt: FieldValue.serverTimestamp(),
    disputeLastRole: role,
  })

  return ''
}

// Emails the other two parties (best effort, never throws).
async function notifyDisputeParties(
  auth: ReturnType<typeof getAuth>,
  order: Record<string, unknown>,
  from: DisputeRole,
  text: string,
) {
  try {
    const adminEmail = process.env.BDS_ADMIN_EMAIL || 'rexgroups.uk@gmail.com'
    const subject = 'New message on a disputed order'
    const preview = text.length > 300 ? `${text.slice(0, 300)}…` : text
    const who = from === 'buyer' ? 'The buyer' : from === 'seller' ? 'The seller' : 'Rex Groups'
    const body = (link: string) => `${who} wrote:\n\n"${preview}"\n\nReply here: ${SITE}${link}`

    if (from !== 'buyer' && order.customerEmail) {
      await sendMail(String(order.customerEmail), subject, body('/marketplace/orders'))
    }

    if (from !== 'seller' && order.sellerId) {
      const seller = await auth.getUser(String(order.sellerId))
      await sendMail(seller.email || '', subject, body('/marketplace/seller'))
    }

    if (from !== 'admin') {
      await sendMail(adminEmail, subject, body('/'))
    }
  } catch (error) {
    console.error('Dispute notification failed:', error)
  }
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

    // GET ?thread=<sellerOrderId>: the dispute conversation for this buyer's order.
    if (req.method === 'GET' && typeof req.query.thread === 'string') {
      const threadId = req.query.thread.trim()
      const snap = await database.collection('sellerOrders').doc(threadId).get()

      if (!snap.exists || snap.data()?.customerId !== uid) {
        return res.status(404).json({ error: 'Order not found.' })
      }

      return res.status(200).json({ messages: await readDisputeThread(database, threadId) })
    }

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

      if (action === 'message') {
        const snap = await database.collection('sellerOrders').doc(sellerOrderId).get()
        const order = snap.data()

        if (!snap.exists || !order || order.customerId !== uid) {
          return res.status(404).json({ error: 'Order not found.' })
        }

        const failure = await addDisputeMessage(
          database, sellerOrderId, order, 'buyer',
          String(order.customerName || 'Buyer'), body.text,
        )

        if (failure) return res.status(400).json({ error: failure })

        await notifyDisputeParties(getAuth(app), order, 'buyer', String(body.text))

        return res.status(200).json({ success: true })
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

      // A reported problem starts the conversation with the buyer's reason.
      if (action === 'dispute') {
        try {
          const fresh = await orderRef.get()
          const order = fresh.data()

          if (order) {
            await orderRef.collection('disputeMessages').add({
              role: 'buyer',
              authorName: String(order.customerName || 'Buyer').slice(0, 80),
              text: reason,
              createdAt: FieldValue.serverTimestamp(),
            })

            await notifyDisputeParties(getAuth(app), order, 'buyer', reason)
          }
        } catch (error) {
          console.error('Dispute thread start failed:', error)
        }
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
          data.refundStatus === 'Refunded'
            ? 'Refunded'
            : data.payoutStatus === 'Disputed'
            ? 'Disputed'
            : ['Released', 'Paid Out'].includes(data.payoutStatus)
              ? 'Released'
              : 'Held',
        autoReleaseAt: toSeconds(data.autoReleaseAt),
        total:
          (Number(data.total) ||
            (Number(data.subtotal) || 0) + (Number(data.deliveryFee) || 0)),
        refundStatus:
          data.refundStatus === 'Refunded'
            ? 'Refunded'
            : data.refundStatus === 'Partially refunded'
              ? 'Partially refunded'
              : '',
        refundedAmount: Number(data.refundedAmount) || 0,
        // Paystack's own progress (Requested / Processing / Processed / Failed).
        refundProviderStatus: String(data.refundProviderStatus || ''),
        refunds: (Array.isArray(data.refunds) ? data.refunds : [])
          .map((r: Record<string, unknown>) => ({
            amount: Number(r.amount) || 0,
            reason: String(r.reason || ''),
            mode: String(r.mode || ''),
            atMs: Number(r.atMs) || 0,
          }))
          .sort((a: { atMs: number }, b: { atMs: number }) => b.atMs - a.atMs),
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
          refundedAmount: packages.reduce(
            (sum, p) => sum + (p.refundedAmount || 0),
            0,
          ),
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
