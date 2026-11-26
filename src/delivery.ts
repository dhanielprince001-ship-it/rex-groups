// Shared types and helpers for store delivery prices and ratings.

export type DeliveryZone = {
  id: string
  location: string
  fee: number
}

export const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
})

// Reads a store's saved price list from Firestore data safely.
export function readZones(value: unknown): DeliveryZone[] {
  if (!Array.isArray(value)) return []

  const zones: DeliveryZone[] = []

  for (const entry of value) {
    if (
      entry &&
      typeof entry.id === 'string' &&
      typeof entry.location === 'string' &&
      typeof entry.fee === 'number' &&
      Number.isFinite(entry.fee)
    ) {
      zones.push({
        id: entry.id,
        location: entry.location,
        fee: entry.fee,
      })
    }
  }

  return zones.sort((a, b) => a.location.localeCompare(b.location))
}

// Picks the location that best matches the customer's address, if any.
export function suggestZone(
  zones: DeliveryZone[],
  city: string,
  state: string,
): string {
  const wanted = [city, state]
    .map((text) => text.trim().toLowerCase())
    .filter(Boolean)

  for (const text of wanted) {
    const exact = zones.find(
      (zone) => zone.location.toLowerCase() === text,
    )

    if (exact) return exact.id
  }

  for (const text of wanted) {
    const partial = zones.find((zone) => {
      const name = zone.location.toLowerCase()
      return name.includes(text) || text.includes(name)
    })

    if (partial) return partial.id
  }

  return ''
}
