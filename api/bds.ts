import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import type { VercelRequest, VercelResponse } from '@vercel/node'

// Single endpoint for the Business Digital Solutions division.
// POST /api/bds  { action, ...payload }  with  Authorization: Bearer <Firebase ID token>
// (Kept as ONE function to stay inside Vercel's Hobby limit of 12 functions.)
// NOTE: constants below mirror src/bds/types.ts. Keep both in sync.

const ADMIN_UID = '5Rt0Jsf9wdQ8eB8BoWINKTdQPve2'

const SERVICE_IDS = ['automation', 'management', 'customers', 'payments', 'analytics', 'integration']
const STATUSES = ['Submitted', 'Under review', 'Approved', 'In progress', 'On hold', 'Completed', 'Rejected', 'Cancelled']
const OPEN_STATUSES = ['Submitted', 'Under review', 'Approved', 'In progress', 'On hold']
const BUDGETS = ['Not sure yet', 'Under ₦500k', '₦500k – ₦2M', '₦2M – ₦5M', '₦5M+']
const TIMELINES = ['Flexible', 'Within 2 weeks', 'Within 1 month', '1 – 3 months']
const CONTACTS = ['Email', 'Phone', 'WhatsApp']
const MAX_OPEN_REQUESTS = 8

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function adminApp() {
  if (getApps().length) return getApps()[0]
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) throw new Error('Firebase credentials are missing')
  return initializeApp({ credential: cert(JSON.parse(raw)) })
}

function text(value: unknown, label: string, min: number, max: number): string {
  const v = typeof value === 'string' ? value.trim().replace(/\r\n/g, '\n') : ''
  if (v.length < min || v.length > max) {
    throw new HttpError(400, min > 0 ? `${label} must be ${min}–${max} characters.` : `${label} must be at most ${max} characters.`)
  }
  return v
}

function optionalText(value: unknown, label: string, max: number): string {
  if (value === undefined || value === null || value === '') return ''
  return text(value, label, 0, max)
}

function oneOf(value: unknown, list: string[], label: string): string {
  if (typeof value !== 'string' || !list.includes(value)) throw new HttpError(400, `Choose a valid ${label}.`)
  return value
}

function isAdminToken(uid: string) {
  return uid === ADMIN_UID
}

async function notify(to: string, subject: string, body: string) {
  const key = process.env.RESEND_API_KEY
  const from = process.env.BDS_NOTIFY_FROM
  if (!key || !from || !to) return // optional: silently skipped when not configured
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text: body }),
    })
  } catch (error) {
    console.error('BDS notification failed:', error)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  try {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Please sign in to continue.')

    const app = adminApp()
    const db = getFirestore(app)
    const decoded = await getAuth(app).verifyIdToken(header.slice(7))
    const uid = decoded.uid
    const admin = isAdminToken(uid)
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''

    const logActivity = (requestId: string, summary: string) =>
      db.collection('bdsActivity').add({
        actorId: uid,
        actorRole: admin ? 'admin' : 'client',
        requestId,
        summary,
        createdAt: FieldValue.serverTimestamp(),
      })

    const loadRequest = async () => {
      const id = text(body.requestId, 'Request', 1, 128)
      const ref = db.collection('bdsRequests').doc(id)
      const snap = await ref.get()
      if (!snap.exists) throw new HttpError(404, 'Request not found.')
      const data = snap.data() as Record<string, unknown>
      if (!admin && data.clientId !== uid) throw new HttpError(403, 'You do not have access to this request.')
      return { ref, data, id }
    }

    const requireAdmin = () => {
      if (!admin) throw new HttpError(403, 'Administrator access required.')
    }

    // ---------- CLIENT ACTIONS ----------

    if (action === 'createRequest') {
      const email = decoded.email
      if (!email) throw new HttpError(400, 'Your account needs an email address.')

      const blocked = await db.collection('bdsClients').doc(uid).get()
      if (blocked.exists && blocked.data()?.blocked === true) {
        throw new HttpError(403, 'Your account cannot submit new requests. Please contact Rex Groups.')
      }

      const services = Array.isArray(body.services) ? [...new Set(body.services as unknown[])] : []
      if (services.length < 1 || services.length > SERVICE_IDS.length || !services.every((s) => typeof s === 'string' && SERVICE_IDS.includes(s))) {
        throw new HttpError(400, 'Select at least one service.')
      }

      const phone = optionalText(body.phone, 'Phone', 30)
      if (phone && !/^[+\d\s()-]{5,30}$/.test(phone)) throw new HttpError(400, 'Enter a valid phone number.')

      const mine = await db.collection('bdsRequests').where('clientId', '==', uid).get()
      const open = mine.docs.filter((d) => OPEN_STATUSES.includes(String(d.data().status))).length
      if (open >= MAX_OPEN_REQUESTS) {
        throw new HttpError(429, `You already have ${MAX_OPEN_REQUESTS} open requests. Please wait for some to finish.`)
      }

      const doc = {
        clientId: uid,
        clientName: text(body.clientName || decoded.name || email, 'Name', 2, 120),
        clientEmail: email,
        phone,
        company: optionalText(body.company, 'Company', 120),
        services,
        title: text(body.title, 'Project title', 5, 120),
        description: text(body.description, 'Description', 30, 2000),
        budget: oneOf(body.budget, BUDGETS, 'budget'),
        timeline: oneOf(body.timeline, TIMELINES, 'timeline'),
        contactMethod: oneOf(body.contactMethod, CONTACTS, 'contact method'),
        status: 'Submitted',
        progress: 0,
        assignee: '',
        adminNote: '',
        lastMessageRole: '',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }

      const ref = await db.collection('bdsRequests').add(doc)
      await ref.collection('updates').add({
        kind: 'status',
        text: 'Request received. Our team will review it shortly.',
        authorName: 'Rex Groups',
        createdAt: FieldValue.serverTimestamp(),
      })
      await logActivity(ref.id, `New request: ${doc.title}`)

      await notify(process.env.BDS_ADMIN_EMAIL || 'rexgroups.uk@gmail.com', `New digital solutions request: ${doc.title}`,
        `${doc.clientName} (${email}) submitted a request.\n\nServices: ${services.join(', ')}\nBudget: ${doc.budget}\nTimeline: ${doc.timeline}\n\n${doc.description}`)
      await notify(email, 'We received your request – Rex Groups',
        `Hi ${doc.clientName},\n\nThanks for your request "${doc.title}". You can track progress and message us from your dashboard.\n\nRex Groups`)

      return res.status(200).json({ ok: true, id: ref.id })
    }

    if (action === 'cancelRequest') {
      const { ref, data, id } = await loadRequest()
      if (!['Submitted', 'Under review'].includes(String(data.status))) {
        throw new HttpError(400, 'Only requests that have not been approved can be cancelled.')
      }
      await ref.update({ status: 'Cancelled', updatedAt: FieldValue.serverTimestamp() })
      await ref.collection('updates').add({
        kind: 'status', text: 'Request cancelled by the client.', authorName: 'Client', createdAt: FieldValue.serverTimestamp(),
      })
      await logActivity(id, `Request cancelled: ${data.title}`)
      return res.status(200).json({ ok: true })
    }

    if (action === 'sendMessage') {
      const { ref, data, id } = await loadRequest()
      if (data.status === 'Cancelled') throw new HttpError(400, 'This request was cancelled.')
      const message = text(body.text, 'Message', 1, 2000)
      const role = admin ? 'admin' : 'client'
      await ref.collection('messages').add({
        role,
        authorName: admin ? 'Rex Groups' : String(data.clientName || 'Client'),
        text: message,
        createdAt: FieldValue.serverTimestamp(),
      })
      await ref.update({ lastMessageRole: role, updatedAt: FieldValue.serverTimestamp() })
      await logActivity(id, `${role === 'admin' ? 'Admin' : 'Client'} message on: ${data.title}`)
      if (admin) {
        await notify(String(data.clientEmail), `New message about "${data.title}"`, `${message}\n\nReply from your Rex Groups dashboard.`)
      } else {
        await notify(process.env.BDS_ADMIN_EMAIL || 'rexgroups.uk@gmail.com', `Client message: ${data.title}`, `${data.clientName}: ${message}`)
      }
      return res.status(200).json({ ok: true })
    }

    // ---------- ADMIN ACTIONS ----------

    if (action === 'setStatus') {
      requireAdmin()
      const { ref, data, id } = await loadRequest()
      const status = oneOf(body.status, STATUSES, 'status')
      if (status === 'Cancelled') throw new HttpError(400, 'Only the client can cancel a request.')
      const note = status === 'Rejected' ? text(body.note, 'Rejection reason', 5, 500) : optionalText(body.note, 'Note', 500)

      const patch: Record<string, unknown> = { status, updatedAt: FieldValue.serverTimestamp() }
      if (status === 'Completed') patch.progress = 100
      if (status === 'Rejected' || status === 'Approved') patch.adminNote = note
      await ref.update(patch)
      await ref.collection('updates').add({
        kind: 'status',
        text: `Status changed to ${status}.${note ? ` ${note}` : ''}`,
        authorName: 'Rex Groups',
        createdAt: FieldValue.serverTimestamp(),
      })
      await logActivity(id, `${status}: ${data.title}`)
      await notify(String(data.clientEmail), `Your request is now "${status}"`,
        `Hi ${data.clientName},\n\nYour request "${data.title}" is now: ${status}.${note ? `\n\n${note}` : ''}\n\nRex Groups`)
      return res.status(200).json({ ok: true })
    }

    if (action === 'assign') {
      requireAdmin()
      const { ref, data, id } = await loadRequest()
      const assignee = optionalText(body.assignee, 'Assignee', 80)
      await ref.update({ assignee, updatedAt: FieldValue.serverTimestamp() })
      await logActivity(id, assignee ? `Assigned to ${assignee}: ${data.title}` : `Unassigned: ${data.title}`)
      return res.status(200).json({ ok: true })
    }

    if (action === 'sendQuote') {
      requireAdmin()
      const { ref, data, id } = await loadRequest()

      if (['Rejected', 'Cancelled', 'Completed'].includes(String(data.status))) {
        throw new HttpError(400, 'A quote cannot be sent for this request.')
      }

      if ((data.quote as { status?: string } | undefined)?.status === 'Accepted') {
        throw new HttpError(400, 'The client already accepted a quote for this request.')
      }

      const amount = Number(body.amount)
      if (!Number.isInteger(amount) || amount < 100 || amount > 1_000_000_000) {
        throw new HttpError(400, 'Enter a whole-naira amount from 100 to 1,000,000,000.')
      }

      const validDays = body.validDays === undefined || body.validDays === '' ? 14 : Number(body.validDays)
      if (!Number.isInteger(validDays) || validDays < 1 || validDays > 60) {
        throw new HttpError(400, 'Quote validity must be 1 to 60 days.')
      }

      const summary = text(body.summary, 'Quote summary', 10, 1000)
      const paymentNote = optionalText(body.paymentNote, 'Payment instructions', 500)

      await ref.update({
        quote: {
          amount,
          currency: 'NGN',
          summary,
          paymentNote,
          validUntil: Timestamp.fromMillis(Date.now() + validDays * 86_400_000),
          status: 'Sent',
          sentAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      })
      await ref.collection('updates').add({
        kind: 'status',
        text: `A quote of ₦${amount.toLocaleString()} was sent. Please review it and accept or decline.`,
        authorName: 'Rex Groups',
        createdAt: FieldValue.serverTimestamp(),
      })
      await logActivity(id, `Quote ₦${amount.toLocaleString()} sent: ${data.title}`)
      await notify(String(data.clientEmail), `Your quote for "${data.title}"`,
        `Hi ${data.clientName},\n\nWe have prepared a quote of ₦${amount.toLocaleString()} (valid for ${validDays} days).\n\n${summary}\n\nReview and accept it in your Rex Groups dashboard.`)
      return res.status(200).json({ ok: true })
    }

    if (action === 'respondQuote') {
      if (admin) throw new HttpError(403, 'Only the client can respond to a quote.')
      const { ref, data, id } = await loadRequest()
      const quote = data.quote as { status?: string; amount?: number; validUntil?: { toMillis(): number } } | undefined

      if (!quote || quote.status !== 'Sent') {
        throw new HttpError(400, 'There is no open quote to respond to.')
      }

      if (quote.validUntil && quote.validUntil.toMillis() < Date.now()) {
        throw new HttpError(400, 'This quote has expired. Please ask for a new one.')
      }

      const decision = oneOf(body.decision, ['accept', 'decline'], 'decision')
      const accepted = decision === 'accept'
      const patch: Record<string, unknown> = {
        'quote.status': accepted ? 'Accepted' : 'Declined',
        'quote.respondedAt': FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }

      if (accepted && ['Submitted', 'Under review'].includes(String(data.status))) {
        patch.status = 'Approved'
      }

      await ref.update(patch)
      await ref.collection('updates').add({
        kind: 'status',
        text: accepted ? 'The client accepted the quote.' : 'The client declined the quote.',
        authorName: 'Client',
        createdAt: FieldValue.serverTimestamp(),
      })
      await logActivity(id, `Quote ${accepted ? 'accepted' : 'declined'}: ${data.title}`)
      await notify(process.env.BDS_ADMIN_EMAIL || 'rexgroups.uk@gmail.com',
        `Quote ${accepted ? 'accepted' : 'declined'}: ${data.title}`,
        `${data.clientName} ${accepted ? 'accepted' : 'declined'} the quote of ₦${Number(quote.amount || 0).toLocaleString()}.`)
      return res.status(200).json({ ok: true })
    }

    if (action === 'recordPayment') {
      requireAdmin()
      const { ref, data, id } = await loadRequest()
      const quote = data.quote as { status?: string; amount?: number } | undefined

      if (!quote || quote.status !== 'Accepted' || !quote.amount) {
        throw new HttpError(400, 'Payments can only be recorded against an accepted quote.')
      }

      const amount = Number(body.amount)
      if (!Number.isInteger(amount) || amount < 1) {
        throw new HttpError(400, 'Enter a whole-naira payment amount.')
      }

      const before = Number((data.payment as { paid?: number } | undefined)?.paid || 0)
      const paid = before + amount

      if (paid > quote.amount) {
        throw new HttpError(400, `That is more than the balance (₦${(quote.amount - before).toLocaleString()}).`)
      }

      const method = oneOf(body.method, ['Bank transfer', 'Cash', 'Paystack link', 'Other'], 'payment method')
      const reference = optionalText(body.reference, 'Reference', 80)
      const balance = quote.amount - paid

      await ref.update({
        payment: {
          paid,
          status: balance === 0 ? 'Paid' : 'Part paid',
          lastMethod: method,
          lastReference: reference,
          paidAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      })
      await ref.collection('updates').add({
        kind: 'status',
        text: `Payment of ₦${amount.toLocaleString()} received (${method}). ${balance === 0 ? 'Paid in full. Thank you!' : `Balance: ₦${balance.toLocaleString()}.`}`,
        authorName: 'Rex Groups',
        createdAt: FieldValue.serverTimestamp(),
      })
      await logActivity(id, `Payment ₦${amount.toLocaleString()} recorded: ${data.title}`)
      await notify(String(data.clientEmail), `Payment received for "${data.title}"`,
        `Hi ${data.clientName},\n\nWe received your payment of ₦${amount.toLocaleString()} (${method}${reference ? `, ref ${reference}` : ''}).\n${balance === 0 ? 'Your project is paid in full. Thank you!' : `Remaining balance: ₦${balance.toLocaleString()}.`}\n\nRex Groups`)
      return res.status(200).json({ ok: true })
    }

    if (action === 'addUpdate') {
      requireAdmin()
      const { ref, data, id } = await loadRequest()
      const message = text(body.text, 'Update', 3, 1000)
      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
      const entry: Record<string, unknown> = {
        kind: 'progress', text: message, authorName: 'Rex Groups', createdAt: FieldValue.serverTimestamp(),
      }
      if (body.progress !== undefined && body.progress !== null && body.progress !== '') {
        const progress = Number(body.progress)
        if (!Number.isInteger(progress) || progress < 0 || progress > 100) throw new HttpError(400, 'Progress must be a whole number from 0 to 100.')
        patch.progress = progress
        entry.progress = progress
      }
      await ref.update(patch)
      await ref.collection('updates').add(entry)
      await logActivity(id, `Progress update: ${data.title}`)
      await notify(String(data.clientEmail), `Progress update on "${data.title}"`, `${message}\n\nView it in your Rex Groups dashboard.`)
      return res.status(200).json({ ok: true })
    }

    if (action === 'saveService') {
      requireAdmin()
      const id = oneOf(body.id, SERVICE_IDS, 'service')
      if (typeof body.active !== 'boolean') throw new HttpError(400, 'Active must be true or false.')
      await db.collection('bdsServices').doc(id).set({
        active: body.active,
        tagline: optionalText(body.tagline, 'Tagline', 160),
        priceNote: optionalText(body.priceNote, 'Pricing note', 80),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      await logActivity('', `Service ${id} ${body.active ? 'enabled' : 'disabled'}`)
      return res.status(200).json({ ok: true })
    }

    if (action === 'saveClient') {
      requireAdmin()
      const clientId = text(body.clientId, 'Client', 1, 128)
      if (typeof body.blocked !== 'boolean') throw new HttpError(400, 'Blocked must be true or false.')
      await db.collection('bdsClients').doc(clientId).set({
        note: optionalText(body.note, 'Note', 1000),
        blocked: body.blocked,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
      await logActivity('', `Client record updated (${clientId.slice(0, 6)}…)`)
      return res.status(200).json({ ok: true })
    }

    throw new HttpError(400, 'Unknown action.')
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message })
    const code = (error as { code?: string })?.code || ''
    if (code.startsWith('auth/')) return res.status(401).json({ error: 'Your session expired. Please sign in again.' })
    console.error('bds api error:', error)
    return res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
}
