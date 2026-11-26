
import { useEffect, useState } from 'react'
import { Plus, Trash2, Truck } from 'lucide-react'

import { useAuth } from './AuthPanel'
import type { DeliveryZone } from './delivery'

type Row = {
  id: string
  location: string
  fee: string
}

let rowCounter = 0

function newRowKey() {
  rowCounter += 1
  return `new-${rowCounter}`
}

function toRows(zones: DeliveryZone[]): Row[] {
  return zones.map((zone) => ({
    id: zone.id,
    location: zone.location,
    fee: String(zone.fee),
  }))
}

// Lets an approved seller set (and later change) delivery prices per location.
export default function SellerDelivery({
  zones,
}: {
  zones: DeliveryZone[]
}) {
  const { user } = useAuth()

  const [rows, setRows] = useState<Row[]>(() => toRows(zones))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Pick up saved changes, but never overwrite edits in progress.
  useEffect(() => {
    if (!dirty) setRows(toRows(zones))
  }, [zones, dirty])

  function update(index: number, patch: Partial<Row>) {
    setDirty(true)
    setMessage('')
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )
  }

  function addRow() {
    setDirty(true)
    setMessage('')
    setRows((current) => [
      ...current,
      { id: newRowKey(), location: '', fee: '' },
    ])
  }

  function removeRow(index: number) {
    setDirty(true)
    setMessage('')
    setRows((current) => current.filter((_, i) => i !== index))
  }

  async function save() {
    if (!user) return

    setError('')
    setMessage('')

    for (const row of rows) {
      if (row.location.trim().length < 2) {
        setError('Every row needs a location name (for example "Lagos Island").')
        return
      }

      const fee = Number(row.fee)

      if (row.fee.trim() === '' || !Number.isFinite(fee) || fee < 0) {
        setError(`Enter a delivery price for ${row.location.trim()} (use 0 for free delivery).`)
        return
      }
    }

    setSaving(true)

    try {
      const token = await user.getIdToken()

      const response = await fetch('/api/seller-delivery', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          zones: rows.map((row) => ({
            // Rows added in this session have no saved id yet.
            id: row.id.startsWith('new-') ? undefined : row.id,
            location: row.location,
            fee: Number(row.fee),
          })),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Unable to save your delivery prices.')
      }

      setRows(toRows(data.zones as DeliveryZone[]))
      setDirty(false)
      setMessage('Delivery prices saved. Customers see the new prices straight away.')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save your delivery prices.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="seller-delivery">
      <div className="seller-delivery-heading">
        <Truck size={22} aria-hidden="true" />

        <div>
          <span className="marketplace-eyebrow">DELIVERY</span>
          <h3>Delivery prices</h3>
          <p>
            Add the places you deliver to and your price for each. Buyers
            choose their location at checkout and the price is added to
            their order. Rex Groups takes no commission on delivery. You
            receive it in full. You can change these prices at any time.
          </p>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="seller-delivery-empty">
          You have not added any delivery prices yet. Until you do,
          buyers are not charged delivery and will need to agree it with
          you directly.
        </p>
      )}

      <div className="seller-delivery-rows">
        {rows.map((row, index) => (
          <div className="seller-delivery-row" key={row.id}>
            <label>
              <span>Location</span>
              <input
                value={row.location}
                maxLength={80}
                placeholder="e.g. Port Harcourt, Lagos Island, Abuja"
                onChange={(e) => update(index, { location: e.target.value })}
              />
            </label>

            <label>
              <span>Price (₦)</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={1000000}
                step={50}
                value={row.fee}
                placeholder="2000"
                onChange={(e) => update(index, { fee: e.target.value })}
              />
            </label>

            <button
              type="button"
              className="seller-delivery-remove"
              aria-label={`Remove ${row.location || 'this location'}`}
              onClick={() => removeRow(index)}
            >
              <Trash2 size={17} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p className="marketplace-error" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="marketplace-success" role="status">
          {message}
        </p>
      )}

      <div className="seller-delivery-actions">
        <button
          type="button"
          className="marketplace-button"
          onClick={addRow}
          disabled={rows.length >= 40}
        >
          <Plus size={16} aria-hidden="true" /> Add location
        </button>

        <button
          type="button"
          className="marketplace-button"
          onClick={() => void save()}
          disabled={saving || !dirty}
        >
          {saving ? 'Saving...' : 'Save delivery prices'}
        </button>
      </div>
    </div>
  )
}
