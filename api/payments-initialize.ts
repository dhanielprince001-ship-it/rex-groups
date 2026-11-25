import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import type { VercelRequest, VercelResponse } from '@vercel/node'

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
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed.',
    })
  }

  const secret = process.env.PAYSTACK_SECRET_KEY

  if (!secret) {
    return res.status(503).json({
      error: 'Online payments are not enabled yet. Your order can remain pending until Paystack is configured.',
    })
  }

  try {
    const authorization = req.headers.authorization

    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Please sign in.',
      })
    }

    const app = appInstance()

    const decoded = await getAuth(app).verifyIdToken(
      authorization.slice(7),
    )

    const db = getFirestore(app)
    const orderId = req.body?.orderId

    if (typeof orderId !== 'string' || !orderId.trim()) {
      return res.status(400).json({
        error: 'A valid order ID is required.',
      })
    }

    const orderRef = db.collection('orders').doc(orderId)
    const orderSnap = await orderRef.get()

    if (!orderSnap.exists) {
      return res.status(404).json({
        error: 'Order not found.',
      })
    }

    const order = orderSnap.data()!

    if (order.customerId !== decoded.uid) {
      return res.status(403).json({
        error: 'You cannot pay for this order.',
      })
    }

    if (order.paymentStatus === 'Paid') {
      return res.status(409).json({
        error: 'This order has already been paid.',
      })
    }

    if (
      order.status !== 'Awaiting Payment' ||
      order.currency !== 'NGN'
    ) {
      return res.status(400).json({
        error: 'This order is not available for payment.',
      })
    }

    const amountKobo = Math.round(Number(order.subtotal) * 100)

    if (
      !Number.isSafeInteger(amountKobo) ||
      amountKobo < 100
    ) {
      return res.status(400).json({
        error: 'The order amount is invalid.',
      })
    }

    const email =
      typeof order.customerEmail === 'string'
        ? order.customerEmail
        : decoded.email

    if (!email) {
      return res.status(400).json({
        error: 'A verified customer email is required.',
      })
    }

    if (typeof order.paymentReference === 'string') {
      const previous = await db
        .collection('transactions')
        .doc(order.paymentReference)
        .get()

      const previousData = previous.data()

      if (
        previous.exists &&
        previousData?.status === 'Initialized' &&
        typeof previousData.authorizationUrl === 'string'
      ) {
        return res.status(200).json({
          success: true,
          reference: order.paymentReference,
          authorizationUrl: previousData.authorizationUrl,
        })
      }
    }

    const reference = `rex-${orderId}-${Date.now()}`

    const baseUrl =
      process.env.APP_BASE_URL ||
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : '')

    const callbackUrl = baseUrl
      ? `${baseUrl}/marketplace/orders?payment=return`
      : undefined

    const paystackResponse = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          amount: amountKobo,
          currency: 'NGN',
          reference,
          ...(callbackUrl
            ? { callback_url: callbackUrl }
            : {}),
          metadata: {
            orderId,
            customerId: decoded.uid,
          },
        }),
      },
    )

    const result = await paystackResponse.json() as any

    if (
      !paystackResponse.ok ||
      result.status !== true ||
      !result.data?.authorization_url
    ) {
      console.error(
        'Paystack initialize failed:',
        result.message || paystackResponse.status,
      )

      return res.status(502).json({
        error: 'Paystack could not start this payment. Please try again later.',
      })
    }

    await db
      .collection('transactions')
      .doc(reference)
      .set({
        reference,
        orderId,
        customerId: decoded.uid,
        provider: 'Paystack',
        amount: amountKobo / 100,
        amountKobo,
        currency: 'NGN',
        status: 'Initialized',
        authorizationUrl: result.data.authorization_url,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

    await orderRef.update({
      paymentReference: reference,
      paymentProvider: 'Paystack',
      updatedAt: FieldValue.serverTimestamp(),
    })

    return res.status(200).json({
      success: true,
      reference,
      authorizationUrl: result.data.authorization_url,
    })
  } catch (error) {
    console.error('Payment initialization error:', error)

    return res.status(500).json({
      error: 'Unable to initialize payment.',
    })
  }
}
