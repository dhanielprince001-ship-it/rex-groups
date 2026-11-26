import type { User } from 'firebase/auth'

// Calls the server-side /api/bds endpoint with the signed-in user's ID token.
export async function bdsApi<T = { ok: true }>(
  user: User,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const token = await user.getIdToken()

  let response: Response
  try {
    response = await fetch('/api/bds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload }),
    })
  } catch {
    throw new Error('Network error. Check your connection and try again.')
  }

  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(data.error || 'Request failed. Please try again.')
  return data as T
}
