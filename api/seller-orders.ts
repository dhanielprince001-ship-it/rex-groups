
import {
  initializeApp,
  getApps,
  cert,
} from 'firebase-admin/app'

import { getAuth } from 'firebase-admin/auth'

import {
  getFirestore,
  FieldValue,
  Timestamp,
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

function toSeconds(value: unknown): { seconds: number } | null {
  const seconds = (value as { seconds?: unknown } | null)?.seconds

  return typeof seconds === 'number' ? { seconds } : null
}

const allowedStatuses = [
  'Processing',
  'Shipped',
  'Delivered',
]


// Best-effort email via Resend. Never throws, so a mail problem can never
// affect a payment or an order. Skipped when RESEND_API_KEY / BDS_NOTIFY_FROM are unset.
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

  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, PATCH, POST')

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

    // GET ?thread=<id>: dispute conversation for one of this seller's orders.
    if (req.method === 'GET' && typeof req.query.thread === 'string') {
      const threadId = req.query.thread.trim()
      const snap = await database.collection('sellerOrders').doc(threadId).get()

      if (!snap.exists || snap.data()?.sellerId !== sellerId) {
        return res.status(404).json({ error: 'Order not found.' })
      }

      return res.status(200).json({ messages: await readDisputeThread(database, threadId) })
    }

    // POST: seller replies in a dispute conversation.
    if (req.method === 'POST') {
      const postBody = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
      const orderId = typeof postBody.sellerOrderId === 'string' ? postBody.sellerOrderId.trim() : ''

      if (!orderId || orderId.length > 150) {
        return res.status(400).json({ error: 'A valid order is required.' })
      }

      const snap = await database.collection('sellerOrders').doc(orderId).get()
      const order = snap.data()

      if (!snap.exists || !order || order.sellerId !== sellerId) {
        return res.status(404).json({ error: 'Order not found.' })
      }

      const failure = await addDisputeMessage(
        database, orderId, order, 'seller',
        String(order.storeName || 'Seller'), postBody.text,
      )

      if (failure) return res.status(400).json({ error: failure })

      await notifyDisputeParties(auth, order, 'seller', String(postBody.text))

      return res.status(200).json({ success: true })
    }

    if (req.method === 'GET') {
      const snapshot = await database
        .collection('sellerOrders')
        .where('sellerId', '==', sellerId)
        .limit(100)
        .get()

      const orders = snapshot.docs.map((order) => {
        const data = order.data()

        return {
          id: order.id,
          ...data,
          createdAt: toSeconds(data.createdAt),
          updatedAt: toSeconds(data.updatedAt),
          paidAt: toSeconds(data.paidAt),
          processingAt: toSeconds(data.processingAt),
          shippedAt: toSeconds(data.shippedAt),
          deliveredAt: toSeconds(data.deliveredAt),
        }
      })

      orders.sort((a, b) => {
        const first = a.createdAt?.seconds || 0
        const second = b.createdAt?.seconds || 0

        return second - first
      })

      return res.status(200).json({
        success: true,
        orders,
      })
    }

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

    if (
      typeof newStatus !== 'string' ||
      !allowedStatuses.includes(newStatus)
    ) {
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

        if (order.sellerId !== sellerId) {
          throw new Error('NOT_ORDER_OWNER')
        }

        if (order.paymentStatus !== 'Paid') {
          throw new Error('PAYMENT_NOT_CONFIRMED')
        }

        if (order.refundStatus === 'Refunded') {
          throw new Error('ORDER_REFUNDED')
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

        if (newStatus === 'Processing') {
          updateData.processingAt = FieldValue.serverTimestamp()
        }

        if (newStatus === 'Shipped') {
          updateData.trackingNumber = trackingNumber.trim()
          updateData.shippingCarrier = shippingCarrier.trim()
          updateData.shippedAt = FieldValue.serverTimestamp()
        }

        if (newStatus === 'Delivered') {
          updateData.deliveredAt = FieldValue.serverTimestamp()

          // Start the buyer's confirmation window. Money stays held until the
          // buyer confirms, reports a problem, or this date passes.
          if (!order.payoutStatus || order.payoutStatus === 'Held') {
            const days = Number(process.env.PAYOUT_AUTO_RELEASE_DAYS) || 3
            updateData.payoutStatus = 'Held'
            updateData.autoReleaseAt = Timestamp.fromMillis(
              Date.now() + days * 86_400_000,
            )
          }
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

    // Tell the buyer about shipping / delivery (best effort).
    if (newStatus === 'Shipped' || newStatus === 'Delivered') {
      try {
        const fresh = (await orderRef.get()).data()

        if (fresh?.customerEmail) {
          await sendMail(
            String(fresh.customerEmail),
            newStatus === 'Shipped'
              ? 'Your order has shipped'
              : 'Your order was marked delivered',
            newStatus === 'Shipped'
              ? `Good news! ${fresh.storeName || 'The seller'} has shipped your order.\n\nTracking number: ${fresh.trackingNumber || 'n/a'}${fresh.shippingCarrier ? ` (${fresh.shippingCarrier})` : ''}\n\nWhen it arrives, please confirm receipt in My orders: ${SITE}/marketplace/orders`
              : `${fresh.storeName || 'The seller'} marked your order as delivered.\n\nPlease confirm you received it, or report a problem, in My orders: ${SITE}/marketplace/orders\nIf you do nothing, payment is released to the seller automatically after a few days.`,
          )
        }
      } catch (error) {
        console.error('Buyer notification failed:', error)
      }
    }

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
        ORDER_REFUNDED: {
          status: 409,
          message: 'This order was refunded to the buyer, so it cannot be fulfilled.',
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
