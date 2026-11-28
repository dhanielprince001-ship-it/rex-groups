import type { User } from 'firebase/auth'
import type { BdsAttachment } from './types'

export const MAX_ATTACHMENTS = 5
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

export function checkAttachment(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return `${file.name}: use a JPG, PNG or WEBP image.`
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name}: images must be 5MB or smaller.`
  return null
}

// Uploads one image straight to Cloudinary using a server-signed request.
export async function uploadAttachment(user: User, file: File): Promise<BdsAttachment> {
  const token = await user.getIdToken()

  const signed = await fetch('/api/cloudinary-signature', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ purpose: 'bds' }),
  })

  const sig = (await signed.json().catch(() => ({}))) as {
    error?: string
    apiKey: string
    timestamp: number
    signature: string
    uploadPreset: string
    folder: string
    cloudName: string
  }

  if (!signed.ok) throw new Error(sig.error || 'Could not prepare the upload.')

  const form = new FormData()
  form.append('file', file)
  form.append('api_key', sig.apiKey)
  form.append('timestamp', String(sig.timestamp))
  form.append('signature', sig.signature)
  form.append('upload_preset', sig.uploadPreset)
  form.append('folder', sig.folder)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  })

  const data = (await response.json().catch(() => ({}))) as {
    secure_url?: string
    public_id?: string
    error?: { message?: string }
  }

  if (!response.ok || !data.secure_url || !data.public_id) {
    throw new Error(data.error?.message || `${file.name} could not be uploaded.`)
  }

  return { url: data.secure_url, publicId: data.public_id, name: file.name.slice(0, 120), size: file.size }
}
