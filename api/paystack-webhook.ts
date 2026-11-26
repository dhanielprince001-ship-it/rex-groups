import { createHmac, timingSafeEqual } from 'node:crypto'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { api: { bodyParser: false } }

function appInstance() {
  if (getApps().length) return getApps()[0]

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT

  if (!raw) {
    throw new Error('Firebase credentials are missing.')
  }

  return initializeApp({
    credential: cert(JSON.parse(raw)),
  })
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET
  const legacySecret = process.env.PAYSTACK_SECRET_KEY

  if (!webhookSecret && !legacySecret) {
    return res.status(503).json({
      error: 'Payment webhook is not configured.',
    })
  }

  try {
    const modernSignature = req.headers['paystack-signature']
    const legacySignature = req.headers['x-paystack-signature']

    const chunks: Buffer[] = []

    for await (const chunk of req) {
      chunks.push(
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
      )
    }

    const rawBody = Buffer.concat(chunks)

    if (!rawBody.length) {
      return res.status(400).send('Missing signed request body.')
    }

    let validSignature = false

    if (
      typeof modernSignature === 'string' &&
      webhookSecret
    ) {
      let timestamp = ''
      const signatures: string[] = []

      for (const part of modernSignature.split(',')) {
        const separator = part.indexOf('=')

        if (separator < 0) continue

        const key = part.slice(0, separator).trim()
        const value = part.slice(separator + 1).trim()

        if (key === 't') timestamp = value

        if (key === 'v1') {
          const colon = value.indexOf(':')

          if (colon >= 0) {
            signatures.push(value.slice(colon + 1))
          }
        }
      }

      const timestampNumber = Number(timestamp)

      if (
        /^[0-9]+$/.test(timestamp) &&
        Math.abs(
          Math.floor(Date.now() / 1000) - timestampNumber,
        ) <= 300
      ) {
        const expected = createHmac('sha512', webhookSecret)
          .update(`${timestamp}.`)
          .update(rawBody)
          .digest()

        validSignature = signatures.some((hex) => {
          if (!/^[0-9a-f]{128}$/.test(hex)) return false

          const received = Buffer.from(hex, 'hex')

          return (
            received.length === expected.length &&
            timingSafeEqual(received, expected)
          )
        })
      }
    } else if (
      typeof legacySignature === 'string' &&
      legacySecret &&
      /^[0-9a-f]{128}$/.test(legacySignature)
    ) {
      const expected = createHmac('sha512', legacySecret)
        .update(rawBody)
        .digest()

      const received = Buffer.from(legacySignature, 'hex')

      validSignature =
        received.length === expected.length &&
        timingSafeEqual(received, expected)
    }

    if (!validSignature) {
      return res.status(401).send('Invalid signature.')
    }

    const event = JSON.parse(rawBody.toString('utf8')) as any
    const payment = event.data || {}
    const db = getFirestore(appInstance())

    // RECORD PAYMENT DISPUTES
    if (
      event.event === 'charge.dispute.create' ||
      event.event === 'charge.dispute.remind' ||
      event.event === 'charge.dispute.resolve'
    ) {
      const disputeId = String(
        payment.id ||
        payment.dispute_id ||
        payment.reference ||
        '',
      )

      if (!disputeId) {
        return res.status(200).send(
          'Dispute event without ID ignored.',
        )
      }

      const disputeStatus =
        event.event === 'charge.dispute.resolve'
          ? 'Closed'
          : event.event === 'charge.dispute.create'
            ? 'Open'
            : 'Under Review'

      await db.collection('disputes').doc(disputeId).set(
        {
          provider: 'Paystack',
          providerDisputeId: disputeId,
          transactionId: payment.transaction || null,
          reference:
            payment.transaction_reference ||
            payment.reference ||
            '',
          amount:
            typeof payment.amount === 'number'
              ? payment.amount / 100
              : null,
          currency: payment.currency || 'NGN',
          reason:
            payment.reason ||
            payment.message ||
            'Payment dispute',
          status: disputeStatus,
          lastProviderEvent: event.event,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )

      return res.status(200).send('Dispute event recorded.')
    }

    // RECORD PAYMENT REFUND EVENTS
    if (
      [
        'refund.pending',
        'refund.processing',
        'refund.processed',
        'refund.failed',
      ].includes(event.event)
    ) {
      const refundId = String(
        payment.id || payment.refund_id || '',
      )

      if (!refundId) {
        return res.status(200).send(
          'Refund event without ID ignored.',
        )
      }

      const statusMap: Record<string, string> = {
        'refund.pending': 'Requested',
        'refund.processing': 'Processing',
        'refund.processed': 'Processed',
        'refund.failed': 'Failed',
      }

      await db.collection('refunds').doc(refundId).set(
        {
          provider: 'Paystack',
          providerRefundId: refundId,
          transactionId: payment.transaction || null,
          reference: payment.transaction_reference || '',
          amount:
            typeof payment.amount === 'number'
              ? payment.amount / 100
              : null,
          currency: payment.currency || 'NGN',
          status: statusMap[event.event],
          lastProviderEvent: event.event,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )

      return res.status(200).send('Refund event recorded.')
    }

    // IGNORE EVENTS WE DO NOT HANDLE
    if (event.event !== 'charge.success') {
      return res.status(200).send('Event ignored.')
    }

    const reference = payment.reference

    if (typeof reference !== 'string') {
      return res.status(400).send('Missing reference.')
    }

    const transactionRef = db
      .collection('transactions')
      .doc(reference)

    const transactionSnap = await transactionRef.get()

    if (!transactionSnap.exists) {
      return res.status(200).send('Unknown reference ignored.')
    }

    const transactionData = transactionSnap.data()!

    if (
      payment.status !== 'success' ||
      payment.currency !== 'NGN' ||
      Number(payment.amount) !==
        Number(transactionData.amountKobo)
    ) {
      return res.status(400).send(
        'Payment details did not match.',
      )
    }

    const orderRef = db
      .collection('orders')
      .doc(String(transactionData.orderId))

    await db.runTransaction(async (tx) => {
      const currentTransaction = await tx.get(transactionRef)
      const orderSnap = await tx.get(orderRef)

      if (!orderSnap.exists) {
        throw new Error('ORDER_NOT_FOUND')
      }

      if (
        currentTransaction.data()?.status === 'Success' ||
        orderSnap.data()?.paymentStatus === 'Paid'
      ) {
        return
      }

      const order = orderSnap.data()!

      if (
        Math.round(Number(order.total ?? order.subtotal) * 100) !==
        Number(payment.amount)
      ) {
        throw new Error('ORDER_AMOUNT_MISMATCH')
      }

      const sellerIds = Array.isArray(order.sellerOrderIds)
        ? order.sellerOrderIds
        : []

      const sellerRefs = sellerIds.map((id: string) =>
        db.collection('sellerOrders').doc(id),
      )

      const sellerSnaps = []

      for (const ref of sellerRefs) {
        sellerSnaps.push(await tx.get(ref))
      }

      tx.update(orderRef, {
        paymentStatus: 'Paid',
        status: 'Awaiting Fulfilment',
        paidAt: FieldValue.serverTimestamp(),
        paymentReference: reference,
        updatedAt: FieldValue.serverTimestamp(),
      })

      for (let index = 0; index < sellerRefs.length; index++) {
        if (sellerSnaps[index].exists) {
          tx.update(sellerRefs[index], {
            paymentStatus: 'Paid',
            status: 'Awaiting Fulfilment',
            paidAt: FieldValue.serverTimestamp(),
            paymentReference: reference,
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      }

      tx.update(transactionRef, {
        status: 'Success',
        providerTransactionId: String(payment.id || ''),
        channel: String(payment.channel || ''),
        paidAt: payment.paid_at || null,
        updatedAt: FieldValue.serverTimestamp(),
      })
    })

    return res.status(200).send('Webhook processed.')
  } catch (error) {
    console.error('Paystack webhook error:', error)

    return res.status(500).send(
      'Webhook processing failed.',
    )
  }
}
