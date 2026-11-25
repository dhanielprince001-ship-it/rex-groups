
import { v2 as cloudinary } from 'cloudinary'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import type { VercelRequest, VercelResponse } from '@vercel/node'

function getFirebaseAdmin() {
  if (getApps().length) return getApps()[0]

  const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT

  if (!rawCredentials) {
    throw new Error('Firebase credentials are missing')
  }

  const credentials = JSON.parse(rawCredentials)

  return initializeApp({
    credential: cert(credentials)
  })
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    })
  }

  try {
    const authorization = req.headers.authorization

    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required'
      })
    }

    const idToken = authorization.slice(7)
    const app = getFirebaseAdmin()

    const decodedToken = await getAuth(app).verifyIdToken(idToken)
    const uid = decodedToken.uid

    // Existing requests default to product uploads.
    const purpose = req.body?.purpose || 'product'

    if (purpose !== 'product' && purpose !== 'store') {
      return res.status(400).json({
        error: 'Invalid upload purpose'
      })
    }

    const storeSnapshot = await getFirestore(app)
      .collection('stores')
      .doc(uid)
      .get()

    const store = storeSnapshot.exists
      ? storeSnapshot.data()
      : null

    if (purpose === 'product') {
      if (
        !store ||
        store.ownerId !== uid ||
        store.status !== 'Approved'
      ) {
        return res.status(403).json({
          error: 'An approved store is required for product uploads'
        })
      }
    }

    if (purpose === 'store' && store) {
      if (
        store.ownerId !== uid ||
        !['Pending', 'Approved'].includes(store.status)
      ) {
        return res.status(403).json({
          error: 'This store cannot upload profile images'
        })
      }
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET

    if (!cloudName || !apiKey || !apiSecret) {
      console.error('Cloudinary environment variables are missing')

      return res.status(500).json({
        error: 'Cloudinary configuration is incomplete'
      })
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret
    })

    const timestamp = Math.floor(Date.now() / 1000)

    const folder =
      purpose === 'store'
        ? `rexgroups/stores/${uid}`
        : `rexgroups/products/${uid}`

    const uploadParameters = {
      timestamp,
      upload_preset: 'rexgroups_products',
      folder
    }

    const signature = cloudinary.utils.api_sign_request(
      uploadParameters,
      apiSecret
    )

    return res.status(200).json({
      timestamp,
      signature,
      folder,
      cloudName,
      apiKey,
      uploadPreset: 'rexgroups_products'
    })
  } catch (error) {
    console.error('Cloudinary signing error:', error)

    return res.status(500).json({
      error: 'Unable to prepare this image upload'
    })
  }
}
