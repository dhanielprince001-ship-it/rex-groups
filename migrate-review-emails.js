
// One-off: moves reviewer emails out of the public `reviews` collection into
// the admin-only `reviewContacts` collection, then removes the field.
// Safe to re-run. Usage (from the project folder, with firebase-admin installed):
//   FIREBASE_SERVICE_ACCOUNT='<service account JSON>' node scripts/migrate-review-emails.mjs
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
const db = getFirestore()

const snapshot = await db.collection('reviews').get()
let moved = 0

for (const review of snapshot.docs) {
  const email = review.get('email')
  if (typeof email !== 'string') continue

  const batch = db.batch()
  batch.set(
    db.collection('reviewContacts').doc(review.id),
    { email, createdAt: review.get('createdAt') ?? FieldValue.serverTimestamp() },
    { merge: true },
  )
  batch.update(review.ref, { email: FieldValue.delete() })
  await batch.commit()
  moved++
}

console.log(`Done. Moved ${moved} email(s) out of ${snapshot.size} review(s).`)
