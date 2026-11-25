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

function validText(value: unknown, min: number, max: number) {
  return (
    typeof value === 'string' &&
    value.trim().length >= min &&
    value.trim().length <= max
  )
}

function toSeconds(value: unknown): { seconds: number } | null {
  const seconds = (value as { seconds?: unknown } | null)?.seconds

  return typeof seconds === 'number' ? { seconds } : null
}

const MAX_ENQUIRIES_PER_STORE = 10

// Buyer <-> seller enquiries.
//   POST  buyer sends an enquiry to an approved store
//   GET   ?role=seller (default) or ?role=buyer lists the caller's enquiries
//   PATCH seller replies to / closes an enquiry
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.setHeader('Cache-Control', 'no-store')

  if (!['GET', 'POST', 'PATCH'].includes(req.method || '')) {
    res.setHeader('Allow', 'GET, POST, PATCH')

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
    const body = req.body || {}
    const enquiries = database.collection('sellerEnquiries')

    // ---------- LIST ----------
    if (req.method === 'GET') {
      const role = req.query.role === 'buyer' ? 'buyer' : 'seller'

      const snapshot = await enquiries
        .where(role === 'buyer' ? 'customerId' : 'sellerId', '==', uid)
        .limit(100)
        .get()

      const items = snapshot.docs
        .map((item) => {
          const data = item.data()

          return {
            id: item.id,
            storeId: data.storeId,
            storeName: data.storeName || 'Store',
            productId: data.productId || '',
            productName: data.productName || '',
            customerName: data.customerName || 'Customer',
            customerEmail: data.customerEmail || '',
            message: data.message || '',
            status: data.status || 'New',
            reply: data.reply || '',
            createdAt: toSeconds(data.createdAt),
            repliedAt: toSeconds(data.repliedAt),
          }
        })
        .sort(
          (a, b) =>
            (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0),
        )

      return res.status(200).json({ success: true, enquiries: items })
    }

    // ---------- SEND (buyer) ----------
    if (req.method === 'POST') {
      const storeId = body.storeId
      const productId = body.productId || ''
      const message = body.message

      if (!validText(storeId, 1, 150)) {
        return res.status(400).json({ error: 'A store is required.' })
      }

      if (!validText(message, 10, 1000)) {
        return res.status(400).json({
          error: 'Your message must be between 10 and 1000 characters.',
        })
      }

      if (typeof productId !== 'string' || productId.length > 150) {
        return res.status(400).json({ error: 'Invalid product.' })
      }

      if (storeId === uid) {
        return res.status(400).json({
          error: 'You cannot send an enquiry to your own store.',
        })
      }

      const storeSnapshot = await database
        .collection('stores')
        .doc(storeId)
        .get()

      const store = storeSnapshot.data()

      if (
        !storeSnapshot.exists ||
        !store ||
        store.status !== 'Approved' ||
        store.ownerId !== storeId
      ) {
        return res.status(400).json({
          error: 'This store is not available for enquiries.',
        })
      }

      let productName = ''

      if (productId) {
        const productSnapshot = await database
          .collection('products')
          .doc(productId)
          .get()

        const product = productSnapshot.data()

        if (
          !productSnapshot.exists ||
          !product ||
          product.ownerId !== storeId
        ) {
          return res.status(400).json({
            error: 'That product does not belong to this store.',
          })
        }

        productName = String(product.name || '')
      }

      const existing = await enquiries
        .where('customerId', '==', uid)
        .where('storeId', '==', storeId)
        .limit(MAX_ENQUIRIES_PER_STORE)
        .get()

      if (existing.size >= MAX_ENQUIRIES_PER_STORE) {
        return res.status(429).json({
          error:
            'You have sent many enquiries to this store. Please wait for a reply.',
        })
      }

      const customerEmail = decodedToken.email || ''

      if (!customerEmail) {
        return res.status(400).json({
          error: 'Your account needs an email address to send enquiries.',
        })
      }

      const ref = await enquiries.add({
        storeId,
        sellerId: storeId,
        storeName: String(store.name || 'Store'),
        productId,
        productName,
        customerId: uid,
        customerName: String(
          decodedToken.name || customerEmail || 'Customer',
        ).slice(0, 120),
        customerEmail,
        message: message.trim(),
        status: 'New',
        reply: '',
        createdAt: FieldValue.serverTimestamp(),
      })

      return res.status(201).json({
        success: true,
        enquiryId: ref.id,
        message: 'Your enquiry has been sent to the seller.',
      })
    }

    // ---------- REPLY / CLOSE (seller) ----------
    const enquiryId = body.enquiryId
    const status = body.status
    const reply = typeof body.reply === 'string' ? body.reply : ''

    if (!validText(enquiryId, 1, 150)) {
      return res.status(400).json({ error: 'An enquiry ID is required.' })
    }

    if (status !== 'Replied' && status !== 'Closed') {
      return res.status(400).json({ error: 'Invalid enquiry status.' })
    }

    if (status === 'Replied' && !validText(reply, 2, 1000)) {
      return res.status(400).json({
        error: 'Your reply must be between 2 and 1000 characters.',
      })
    }

    const enquiryRef = enquiries.doc(enquiryId)
    const enquirySnapshot = await enquiryRef.get()

    if (!enquirySnapshot.exists) {
      return res.status(404).json({ error: 'Enquiry not found.' })
    }

    if (enquirySnapshot.data()!.sellerId !== uid) {
      return res.status(403).json({
        error: 'You cannot update another seller’s enquiry.',
      })
    }

    const update: Record<string, unknown> = {
      status,
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (status === 'Replied') {
      update.reply = reply.trim()
      update.repliedAt = FieldValue.serverTimestamp()
    }

    await enquiryRef.update(update)

    return res.status(200).json({
      success: true,
      message:
        status === 'Replied' ? 'Reply sent.' : 'Enquiry closed.',
    })
  } catch (error) {
    console.error('Seller enquiries API error:', error)

    return res.status(500).json({
      error: 'Unable to process this enquiry request.',
    })
  }
}
