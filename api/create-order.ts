
import {
  initializeApp,
  getApps,
  cert,
} from 'firebase-admin/app'

import {
  getAuth,
} from 'firebase-admin/auth'

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
    throw new Error('Firebase credentials are missing')
  }

  return initializeApp({
    credential: cert(JSON.parse(rawCredentials)),
  })
}

type DeliveryZone = {
  id: string
  location: string
  fee: number
}

// Reads a store's saved delivery price list, ignoring anything malformed.
function readDeliveryZones(value: unknown): DeliveryZone[] {
  if (!Array.isArray(value)) return []

  const zones: DeliveryZone[] = []

  for (const entry of value) {
    if (
      entry &&
      typeof entry.id === 'string' &&
      typeof entry.location === 'string' &&
      typeof entry.fee === 'number' &&
      Number.isFinite(entry.fee) &&
      entry.fee >= 0
    ) {
      zones.push({
        id: entry.id,
        location: entry.location,
        fee: entry.fee,
      })
    }
  }

  return zones
}

function validText(value: unknown, maxLength: number) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  )
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
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

    const uid = decodedToken.uid
    const body = req.body || {}

    const address = body.shippingAddress

    if (!address || typeof address !== 'object') {
      return res.status(400).json({
        error: 'Delivery information is required.',
      })
    }

    const fullName = address.fullName
    const phone = address.phone
    const country = address.country
    const state = address.state
    const city = address.city
    const streetAddress = address.streetAddress
    const postalCode = address.postalCode || ''

    if (
      !validText(fullName, 120) ||
      !validText(phone, 30) ||
      !validText(country, 100) ||
      !validText(state, 100) ||
      !validText(city, 100) ||
      !validText(streetAddress, 300) ||
      typeof postalCode !== 'string' ||
      postalCode.length > 30
    ) {
      return res.status(400).json({
        error: 'Please provide valid delivery information.',
      })
    }

    const customerEmail =
      decodedToken.email || body.email

    if (
      !validText(customerEmail, 254) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ) {
      return res.status(400).json({
        error: 'A valid customer email is required.',
      })
    }

    if (
      !Array.isArray(body.items) ||
      body.items.length === 0 ||
      body.items.length > 50
    ) {
      return res.status(400).json({
        error: 'Your cart is empty or contains too many items.',
      })
    }

    const requestedItems = body.items
    const seenIds = new Set<string>()

    for (const item of requestedItems) {
      if (
        !item ||
        typeof item.productId !== 'string' ||
        !item.productId.trim() ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 20 ||
        seenIds.has(item.productId)
      ) {
        return res.status(400).json({
          error: 'Your cart contains invalid items.',
        })
      }

      seenIds.add(item.productId)
    }

    // Read the actual products from Firestore.
    const productSnapshots = await Promise.all(
      requestedItems.map((item: {
        productId: string
        quantity: number
      }) =>
        database
          .collection('products')
          .doc(item.productId)
          .get(),
      ),
    )

    const commissionSettings = await database
      .collection('settings')
      .doc('marketplace')
      .get()

    const configuredCommission =
      commissionSettings.data()?.commissionPercent

    const commissionPercent =
      typeof configuredCommission === 'number' &&
      Number.isFinite(configuredCommission) &&
      configuredCommission >= 0 &&
      configuredCommission <= 100
        ? configuredCommission
        : 10

    const sellerGroups = new Map<string, {
      sellerId: string
      storeName: string
      items: Array<{
        productId: string
        name: string
        imageUrl: string
        unitPrice: number
        quantity: number
        lineTotal: number
      }>
      subtotalKobo: number
      deliveryZones: DeliveryZone[]
    }>()

    const deliveryChoices: Record<string, unknown> =
      body.deliveryChoices &&
      typeof body.deliveryChoices === 'object' &&
      !Array.isArray(body.deliveryChoices)
        ? body.deliveryChoices
        : {}

    let totalSubtotalKobo = 0

    for (let index = 0; index < requestedItems.length; index++) {
      const requested = requestedItems[index]
      const productSnapshot = productSnapshots[index]

      if (!productSnapshot.exists) {
        return res.status(400).json({
          error: 'A product in your cart is no longer available.',
        })
      }

      const product = productSnapshot.data()!

      if (
        product.status !== 'Approved' ||
        typeof product.ownerId !== 'string' ||
        product.storeId !== product.ownerId ||
        typeof product.price !== 'number' ||
        !Number.isFinite(product.price) ||
        product.price <= 0 ||
        !validText(product.name, 100)
      ) {
        return res.status(400).json({
          error: 'A product in your cart is currently unavailable.',
        })
      }

      const sellerId = product.ownerId

      const storeSnapshot = await database
        .collection('stores')
        .doc(sellerId)
        .get()

      if (!storeSnapshot.exists) {
        return res.status(400).json({
          error: 'A seller in your cart is unavailable.',
        })
      }

      const store = storeSnapshot.data()!

      if (
        store.ownerId !== sellerId ||
        store.status !== 'Approved'
      ) {
        return res.status(400).json({
          error: 'A seller in your cart is not currently approved.',
        })
      }

      const unitPriceKobo = Math.round(product.price * 100)
      const lineTotalKobo =
        unitPriceKobo * requested.quantity

      if (
        !Number.isSafeInteger(unitPriceKobo) ||
        !Number.isSafeInteger(lineTotalKobo)
      ) {
        return res.status(400).json({
          error: 'A product price is invalid.',
        })
      }

      let group = sellerGroups.get(sellerId)

      if (!group) {
        group = {
          sellerId,
          storeName:
            typeof store.name === 'string' && store.name.trim()
              ? store.name
              : 'Store',
          items: [],
          subtotalKobo: 0,
          deliveryZones: readDeliveryZones(store.deliveryZones),
        }

        sellerGroups.set(sellerId, group)
      }

      group.items.push({
        productId: productSnapshot.id,
        name: product.name,
        imageUrl: product.imageUrl || '',
        unitPrice: unitPriceKobo / 100,
        quantity: requested.quantity,
        lineTotal: lineTotalKobo / 100,
      })

      group.subtotalKobo += lineTotalKobo
      totalSubtotalKobo += lineTotalKobo
    }

    const orderRef = database.collection('orders').doc()
    const batch = database.batch()

    // Work out each seller's delivery fee from THEIR saved price list.
    // The browser only says which location was picked; the price always
    // comes from the database, so it cannot be changed by the customer.
    const deliveryByStore = new Map<string, {
      feeKobo: number
      zoneId: string | null
      location: string | null
    }>()

    for (const group of sellerGroups.values()) {
      if (group.deliveryZones.length === 0) {
        // The seller has not set any delivery prices yet.
        deliveryByStore.set(group.sellerId, {
          feeKobo: 0,
          zoneId: null,
          location: null,
        })
        continue
      }

      const chosenId = deliveryChoices[group.sellerId]

      const zone = group.deliveryZones.find(
        (entry) => entry.id === chosenId,
      )

      if (!zone) {
        return res.status(400).json({
          error: `Please choose a delivery location for ${group.storeName}.`,
        })
      }

      deliveryByStore.set(group.sellerId, {
        feeKobo: Math.round(zone.fee * 100),
        zoneId: zone.id,
        location: zone.location,
      })
    }

    const sellerOrderIds: string[] = []
    const deliveryDetails: Array<{
      sellerId: string
      storeName: string
      location: string | null
      fee: number
    }> = []

    let totalCommissionKobo = 0
    let totalDeliveryKobo = 0

    for (const group of sellerGroups.values()) {
      const sellerOrderRef = database
        .collection('sellerOrders')
        .doc()

      const delivery = deliveryByStore.get(group.sellerId)!

      // Commission is charged on the products only. Delivery is paid
      // to the seller in full.
      const commissionKobo = Math.round(
        group.subtotalKobo * commissionPercent / 100,
      )

      const sellerNetKobo =
        group.subtotalKobo - commissionKobo + delivery.feeKobo

      totalCommissionKobo += commissionKobo
      totalDeliveryKobo += delivery.feeKobo

      deliveryDetails.push({
        sellerId: group.sellerId,
        storeName: group.storeName,
        location: delivery.location,
        fee: delivery.feeKobo / 100,
      })
      sellerOrderIds.push(sellerOrderRef.id)

      batch.set(sellerOrderRef, {
        orderId: orderRef.id,
        sellerOrderId: sellerOrderRef.id,
        customerId: uid,
        customerName: fullName.trim(),
        customerEmail,
        sellerId: group.sellerId,
        storeName: group.storeName,
        items: group.items,
        subtotal: group.subtotalKobo / 100,
        deliveryFee: delivery.feeKobo / 100,
        deliveryZoneId: delivery.zoneId,
        deliveryLocation: delivery.location,
        total: (group.subtotalKobo + delivery.feeKobo) / 100,
        commissionPercent,
        commissionAmount: commissionKobo / 100,
        sellerNetAmount: sellerNetKobo / 100,
        currency: 'NGN',
        status: 'Awaiting Payment',
        paymentStatus: 'Unpaid',
        shippingAddress: {
          fullName: fullName.trim(),
          phone: phone.trim(),
          country: country.trim(),
          state: state.trim(),
          city: city.trim(),
          streetAddress: streetAddress.trim(),
          postalCode: postalCode.trim(),
        },
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    batch.set(orderRef, {
      customerId: uid,
      customerName: fullName.trim(),
      customerEmail,
      items: Array.from(sellerGroups.values()).flatMap(
        (group) => group.items,
      ),
      sellerOrderIds,
      sellerCount: sellerGroups.size,
      subtotal: totalSubtotalKobo / 100,
      deliveryFee: totalDeliveryKobo / 100,
      deliveryDetails,
      total: (totalSubtotalKobo + totalDeliveryKobo) / 100,
      commissionPercent,
      commissionAmount: totalCommissionKobo / 100,
      currency: 'NGN',
      status: 'Awaiting Payment',
      paymentStatus: 'Unpaid',
      shippingAddress: {
        fullName: fullName.trim(),
        phone: phone.trim(),
        country: country.trim(),
        state: state.trim(),
        city: city.trim(),
        streetAddress: streetAddress.trim(),
        postalCode: postalCode.trim(),
      },
      createdAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()

    return res.status(201).json({
      success: true,
      orderId: orderRef.id,
      subtotal: totalSubtotalKobo / 100,
      deliveryFee: totalDeliveryKobo / 100,
      total: (totalSubtotalKobo + totalDeliveryKobo) / 100,
      commissionAmount: totalCommissionKobo / 100,
      commissionPercent,
      status: 'Awaiting Payment',
    })
  } catch (error) {
    console.error('Order creation error:', error)

    return res.status(500).json({
      error: 'Unable to create your order. Please try again.',
    })
  }
}
