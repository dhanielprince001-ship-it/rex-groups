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

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2)
}

// Bank account names are often written "SURNAME FIRSTNAME", so compare the
// words in any order: at least two words of the seller's name must appear
// in the name the bank returns.
function namesMatch(legalName: string, accountName: string) {
  const legal = words(legalName)
  const account = new Set(words(accountName))

  if (legal.length === 0 || account.size === 0) return false

  const hits = legal.filter((word) => account.has(word)).length

  return hits >= Math.min(2, legal.length)
}

function maskAccount(accountNumber: string) {
  return `******${accountNumber.slice(-4)}`
}

// Seller identity checks.
//   GET  ?banks=1  -> list of Nigerian banks (for the dropdown)
//   GET            -> the signed-in seller's own verification status
//   POST           -> submit bank details; the account name is checked
//                     against the seller's legal name through Paystack
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

    const decoded = await getAuth(app).verifyIdToken(
      authorization.slice(7),
    )

    const sellerId = decoded.uid
    const secret = process.env.PAYSTACK_SECRET_KEY

    if (req.method === 'GET' && req.query.banks) {
      if (!secret) {
        return res.status(200).json({ success: true, banks: [] })
      }

      const response = await fetch(
        'https://api.paystack.co/bank?country=nigeria&perPage=200',
        { headers: { Authorization: `Bearer ${secret}` } },
      )

      const result = (await response.json()) as {
        data?: Array<{ name: string; code: string }>
      }

      const banks = (result.data || [])
        .map((bank) => ({ name: bank.name, code: bank.code }))
        .sort((a, b) => a.name.localeCompare(b.name))

      return res.status(200).json({ success: true, banks })
    }

    const verificationRef = database
      .collection('sellerVerifications')
      .doc(sellerId)

    if (req.method === 'GET') {
      const snap = await verificationRef.get()

      if (!snap.exists) {
        return res.status(200).json({ success: true, verification: null })
      }

      const data = snap.data()!

      // Only a masked account number is ever sent back to the seller.
      return res.status(200).json({
        success: true,
        verification: {
          status: data.status,
          legalName: data.legalName,
          bankName: data.bankName,
          accountMasked: maskAccount(String(data.accountNumber || '')),
          accountName: data.accountName || '',
          nameChecked: data.nameChecked === true,
          rejectionReason: data.rejectionReason || '',
        },
      })
    }

    // POST: submit details
    const storeSnap = await database.collection('stores').doc(sellerId).get()

    if (!storeSnap.exists || storeSnap.data()?.ownerId !== sellerId) {
      return res.status(403).json({
        error: 'You do not have a store.',
      })
    }

    const body = req.body || {}

    const legalName =
      typeof body.legalName === 'string'
        ? body.legalName.trim().replace(/\s+/g, ' ')
        : ''

    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const bankCode = typeof body.bankCode === 'string' ? body.bankCode.trim() : ''
    const bankName = typeof body.bankName === 'string' ? body.bankName.trim() : ''

    const accountNumber =
      typeof body.accountNumber === 'string' ? body.accountNumber.trim() : ''

    const businessRegNumber =
      typeof body.businessRegNumber === 'string'
        ? body.businessRegNumber.trim().slice(0, 40)
        : ''

    if (legalName.length < 5 || legalName.length > 100) {
      return res.status(400).json({
        error: 'Enter your full legal name (as it appears on your bank account).',
      })
    }

    if (!/^\+?[0-9\s-]{8,18}$/.test(phone)) {
      return res.status(400).json({
        error: 'Enter a valid phone number.',
      })
    }

    if (!/^[0-9]{10}$/.test(accountNumber)) {
      return res.status(400).json({
        error: 'A Nigerian bank account number has 10 digits.',
      })
    }

    if (!bankCode || bankName.length < 2) {
      return res.status(400).json({
        error: 'Choose your bank.',
      })
    }

    const existing = await verificationRef.get()

    if (existing.exists && existing.data()?.status === 'Verified') {
      return res.status(409).json({
        error: 'Your store is already verified. Contact Rex Groups to change your details.',
      })
    }

    // The bank itself tells us who owns the account.
    let accountName = ''
    let nameChecked = false

    if (secret) {
      const response = await fetch(
        `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
        { headers: { Authorization: `Bearer ${secret}` } },
      )

      const result = (await response.json()) as {
        status?: boolean
        data?: { account_name?: string }
      }

      if (!response.ok || !result.status || !result.data?.account_name) {
        return res.status(400).json({
          error: 'We could not find that bank account. Check the bank and account number.',
        })
      }

      accountName = result.data.account_name
      nameChecked = true

      if (!namesMatch(legalName, accountName)) {
        return res.status(400).json({
          error: `The name on that bank account (${accountName}) does not match the legal name you entered. Use the same name as your account.`,
        })
      }
    }

    await verificationRef.set({
      sellerId,
      legalName,
      phone,
      bankCode,
      bankName,
      accountNumber,
      accountName,
      // false means Paystack was not configured, so an admin must check the
      // account name by hand.
      nameChecked,
      businessRegNumber,
      status: 'Pending Review',
      rejectionReason: '',
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return res.status(200).json({
      success: true,
      status: 'Pending Review',
      accountName,
      nameChecked,
    })
  } catch (error) {
    console.error('Seller verification error:', error)

    return res.status(500).json({
      error: 'Unable to process your request. Please try again.',
    })
  }
}
