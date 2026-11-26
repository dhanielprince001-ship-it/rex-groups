
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  CircleDollarSign,
  ClipboardList,
  RefreshCw,
  ShieldAlert,
  Store,
  Wallet,
} from 'lucide-react'
import { useAuth } from './AuthPanel'

type Row = Record<string, any> & { id: string }

type StoreRow = Row & {
  name?: string
  ownerId?: string
  ownerName?: string
  email?: string
  status?: string
}

type ProfileRow = Row & {
  uid?: string
  email?: string
  name?: string
  fullName?: string
}

type SellerRow = StoreRow & {
  sellerEmail: string
  sellerName: string
  orderCount: number
  sellerEarnings: number
}

type Payload = {
  stores: StoreRow[]
  profiles: ProfileRow[]
  orders: Row[]
  sellerOrders: Row[]
  transactions: Row[]
  refunds: Row[]
  disputes: Row[]
  sellerVerifications: Row[]
  settings: { commissionPercent: number }[]
}

const money = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 2,
})

const dateText = (value: any) =>
  value?.seconds
    ? new Date(value.seconds * 1000).toLocaleString()
    : '—'

const number = (value: any) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

export default function AdminMarketplaceManagement() {
  const { user } = useAuth()

  const [data, setData] = useState<Payload>({
    stores: [],
    profiles: [],
    orders: [],
    sellerOrders: [],
    transactions: [],
    refunds: [],
    disputes: [],
    sellerVerifications: [],
    settings: [{ commissionPercent: 10 }],
  })

  const [requireVerified, setRequireVerified] = useState(false)

  const [commission, setCommission] = useState('10')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [tab, setTab] = useState<
    | 'overview'
    | 'sellers'
    | 'verification'
    | 'orders'
    | 'payouts'
    | 'transactions'
    | 'cases'
  >('overview')

  const request = useCallback(
    async (
      method: 'GET' | 'PATCH' | 'POST',
      body?: Record<string, unknown>,
    ) => {
      if (!user) {
        throw new Error('Please sign in again.')
      }

      const token = await user.getIdToken()

      const response = await fetch('/api/admin-marketplace', {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          result.error || 'The request could not be completed.',
        )
      }

      return result
    },
    [user],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = (await request('GET')) as Payload

      // The server sends settings as one object; older code expected a list.
      const rawSettings = result.settings as unknown
      const settingsObject = (
        Array.isArray(rawSettings) ? rawSettings[0] : rawSettings
      ) as
        | { commissionPercent?: number; requireVerifiedSellers?: boolean }
        | undefined

      const savedCommission =
        typeof settingsObject?.commissionPercent === 'number'
          ? settingsObject.commissionPercent
          : 10

      setData({
        stores: result.stores || [],
        profiles: result.profiles || [],
        orders: result.orders || [],
        sellerOrders: result.sellerOrders || [],
        transactions: result.transactions || [],
        refunds: result.refunds || [],
        disputes: result.disputes || [],
        sellerVerifications: result.sellerVerifications || [],
        settings: [{ commissionPercent: savedCommission }],
      })

      setRequireVerified(settingsObject?.requireVerifiedSellers === true)

      setCommission(String(savedCommission))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load marketplace data.',
      )
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    void load()
  }, [load])

  const paidOrders = data.orders.filter(
    (order) => order.paymentStatus === 'Paid',
  )

  const totalSales = paidOrders.reduce(
    (sum, order) =>
      sum + number(order.subtotal) + number(order.deliveryFee),
    0,
  )

  const earnings = paidOrders.reduce(
    (sum, order) => sum + number(order.commissionAmount),
    0,
  )

  const sellerCount = new Set(
    data.stores.map((store) => store.ownerId).filter(Boolean),
  ).size

  const pendingStores = data.stores.filter(
    (store) => store.status === 'Pending',
  ).length

  const sellers: SellerRow[] = useMemo(
    () =>
      data.stores.map((store): SellerRow => {
        const profile: ProfileRow =
          data.profiles.find(
            (item) =>
              item.id === store.ownerId ||
              item.uid === store.ownerId,
          ) || ({} as ProfileRow)

        const sellerOrders = data.sellerOrders.filter(
          (order) => order.sellerId === store.ownerId,
        )

        return {
          ...store,
          sellerEmail: profile.email || store.email || '—',
          sellerName:
            profile.name ||
            profile.fullName ||
            store.ownerName ||
            'Seller',
          orderCount: sellerOrders.length,
          sellerEarnings: sellerOrders
            .filter((order) => order.paymentStatus === 'Paid')
            .reduce(
              (sum: number, order: Row) =>
                sum + number(order.sellerNetAmount),
              0,
            ),
        }
      }),
    [data],
  )

  async function action(
    label: string,
    body: Record<string, unknown>,
  ) {
    setBusy(label)
    setError('')
    setSuccess('')

    try {
      await request(
        body.action === 'createRefundRequest'
          ? 'POST'
          : 'PATCH',
        body,
      )

      setSuccess('Update saved successfully.')
      await load()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to save this update.',
      )
    } finally {
      setBusy('')
    }
  }

  async function saveCommission() {
    const value = Number(commission)

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      setError(
        'Enter a commission percentage from 0 to 100.',
      )
      return
    }

    await action('commission', {
      action: 'commission',
      commissionPercent: value,
    })
  }

  if (loading) {
    return (
      <section className="admin-market-panel">
        <p>Loading marketplace management...</p>
      </section>
    )
  }

  return (
    <section className="admin-market-panel">
      <div className="admin-market-title">
        <div>
          <span className="section-kicker">
            REX GROUPS MARKETPLACE
          </span>

          <h3>Marketplace control centre</h3>

          <p>
            Manage sellers, orders, payment records,
            commission and customer cases.
          </p>
        </div>

        <button
          className="admin-button"
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}

      {success && (
        <p className="admin-success" role="status">
          {success}
        </p>
      )}

      <nav
        className="admin-market-tabs"
        aria-label="Marketplace administration"
      >
        {(
          [
            'overview',
            'sellers',
            'verification',
            'orders',
            'payouts',
            'transactions',
            'cases',
          ] as const
        ).map((item) => (
          <button
            key={item}
            className={tab === item ? 'active' : ''}
            onClick={() => setTab(item)}
          >
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <>
          <div className="admin-market-metrics">
            <article>
              <Store />
              <span>Active sellers</span>
              <strong>{sellerCount}</strong>
            </article>

            <article>
              <ClipboardList />
              <span>All orders</span>
              <strong>{data.orders.length}</strong>
            </article>

            <article>
              <CircleDollarSign />
              <span>Verified marketplace sales</span>
              <strong>{money.format(totalSales)}</strong>
            </article>

            <article>
              <Wallet />
              <span>Rex Groups commission earned</span>
              <strong>{money.format(earnings)}</strong>
            </article>
          </div>

          <div className="admin-market-settings">
            <div>
              <span className="section-kicker">
                REVENUE SETTINGS
              </span>

              <h4>Marketplace commission</h4>

              <p>
                Applied to product subtotal, excluding
                delivery and provider fees. Existing
                orders retain their saved rate.
              </p>
            </div>

            <div className="admin-market-commission">
              <label htmlFor="market-commission">
                Commission (%)
              </label>

              <input
                id="market-commission"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={commission}
                onChange={(event) =>
                  setCommission(event.target.value)
                }
              />

              <button
                className="admin-button admin-button-primary"
                onClick={() => void saveCommission()}
                disabled={busy === 'commission'}
              >
                {busy === 'commission'
                  ? 'Saving...'
                  : 'Save commission'}
              </button>
            </div>
          </div>

          <div className="admin-market-note">
            <Activity size={18} />

            <span>
              Sales and earnings above use orders marked
              Paid by verified payment processing.
              Pending/unpaid orders are excluded.
            </span>
          </div>

          <div className="admin-market-quick">
            <p>
              <strong>{pendingStores}</strong> store
              applications waiting for review
            </p>

            <p>
              <strong>
                {
                  data.refunds.filter(
                    (item) =>
                      !['Processed', 'Rejected'].includes(
                        item.status,
                      ),
                  ).length
                }
              </strong>{' '}
              refund cases requiring attention
            </p>

            <p>
              <strong>
                {
                  data.disputes.filter(
                    (item) =>
                      !['Won', 'Lost', 'Closed'].includes(
                        item.status,
                      ),
                  ).length
                }
              </strong>{' '}
              open disputes
            </p>
          </div>
        </>
      )}

      {tab === 'sellers' && (
        <div className="admin-market-table-wrap">
          <h4>Seller and store management</h4>

          {sellers.length === 0 ? (
            <p>No seller stores found.</p>
          ) : (
            <table className="admin-market-table">
              <thead>
                <tr>
                  <th>Store / seller</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Orders</th>
                  <th>Seller net (paid)</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {sellers.map((seller) => (
                  <tr key={seller.id}>
                    <td>
                      <strong>{seller.name || 'Unnamed store'}</strong>
                      <small>
                        {seller.sellerName} · {seller.ownerId}
                      </small>
                    </td>

                    <td>{seller.sellerEmail}</td>
                    <td>{seller.status || 'Unknown'}</td>
                    <td>{seller.orderCount}</td>
                    <td>
                      {money.format(seller.sellerEarnings)}
                    </td>

                    <td>
                      <div className="admin-market-row-actions">
                        {seller.status !== 'Approved' && (
                          <button
                            onClick={() =>
                              void action(seller.id, {
                                action: 'storeStatus',
                                storeId: seller.id,
                                status: 'Approved',
                              })
                            }
                            disabled={!!busy}
                          >
                            Approve
                          </button>
                        )}

                        {seller.status !== 'Suspended' && (
                          <button
                            onClick={() =>
                              void action(seller.id, {
                                action: 'storeStatus',
                                storeId: seller.id,
                                status: 'Suspended',
                              })
                            }
                            disabled={!!busy}
                          >
                            Suspend
                          </button>
                        )}

                        {seller.status === 'Suspended' && (
                          <button
                            onClick={() =>
                              void action(seller.id, {
                                action: 'storeStatus',
                                storeId: seller.id,
                                status: 'Approved',
                              })
                            }
                            disabled={!!busy}
                          >
                            Reactivate
                          </button>
                        )}

                        {seller.status !== 'Rejected' && (
                          <button
                            onClick={() =>
                              void action(seller.id, {
                                action: 'storeStatus',
                                storeId: seller.id,
                                status: 'Rejected',
                              })
                            }
                            disabled={!!busy}
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div className="admin-market-table-wrap">
          <h4>All customer orders</h4>

          {data.orders.length === 0 ? (
            <p>No orders recorded yet.</p>
          ) : (
            <table className="admin-market-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Subtotal</th>
                  <th>Commission</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Refund</th>
                </tr>
              </thead>

              <tbody>
                {data.orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>

                    <td>
                      {order.customerName}
                      <small>{order.customerEmail}</small>
                    </td>

                    <td>
                      {Array.isArray(order.items)
                        ? order.items.reduce(
                            (sum: number, item: Row) =>
                              sum + number(item.quantity),
                            0,
                          )
                        : 0}
                    </td>

                    <td>
                      {money.format(number(order.subtotal))}

                      {number(order.deliveryFee) > 0 && (
                        <small style={{ display: 'block', opacity: 0.7 }}>
                          + {money.format(number(order.deliveryFee))} delivery
                        </small>
                      )}
                    </td>

                    <td>
                      {money.format(
                        number(order.commissionAmount),
                      )}
                    </td>

                    <td>{order.paymentStatus || 'Unknown'}</td>
                    <td>{order.status || '—'}</td>
                    <td>{dateText(order.createdAt)}</td>

                    <td>
                      {order.paymentStatus === 'Paid' && (
                        <button
                          className="admin-market-case-button"
                          onClick={() => {
                            const reason = window.prompt(
                              'Reason for logging this refund request:',
                            )

                            if (
                              reason &&
                              reason.trim().length >= 5
                            ) {
                              void action(order.id, {
                                action: 'createRefundRequest',
                                orderId: order.id,
                                reason,
                              })
                            }
                          }}
                          disabled={!!busy}
                        >
                          Log refund case
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'verification' && (
        <div className="admin-market-table-wrap">
          <h4>Seller verification</h4>

          <label className="admin-market-require">
            <input
              type="checkbox"
              checked={requireVerified}
              disabled={!!busy}
              onChange={(event) =>
                void action('require-verified', {
                  action: 'set-require-verified',
                  value: event.target.checked,
                })
              }
            />
            Only verified sellers can receive orders
          </label>

          <p className="admin-market-note">
            Approve a seller after the bank account name matches their
            legal name. Verified stores get a badge, and their bank
            details appear in the Payouts tab.
          </p>

          {data.sellerVerifications.length === 0 ? (
            <p>No sellers have submitted verification yet.</p>
          ) : (
            <table className="admin-market-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Legal name</th>
                  <th>Bank account</th>
                  <th>Name check</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {[...data.sellerVerifications]
                  .sort((a, b) =>
                    a.status === 'Pending Review' ? -1 : b.status === 'Pending Review' ? 1 : 0,
                  )
                  .map((item) => {
                    const store = data.stores.find(
                      (entry) => entry.id === item.id,
                    )

                    return (
                      <tr key={item.id}>
                        <td>{store?.name || item.id}</td>
                        <td>
                          {item.legalName}
                          <small style={{ display: 'block', opacity: 0.7 }}>
                            {item.phone}
                            {item.businessRegNumber
                              ? ` · Reg: ${item.businessRegNumber}`
                              : ''}
                          </small>
                        </td>
                        <td>
                          {item.bankName}
                          <small style={{ display: 'block', opacity: 0.7 }}>
                            {item.accountNumber}
                          </small>
                        </td>
                        <td>
                          {item.nameChecked
                            ? `Bank says: ${item.accountName}`
                            : 'Not checked automatically. Check the account name yourself.'}
                        </td>
                        <td>
                          {item.status}
                          {item.rejectionReason
                            ? ` · ${item.rejectionReason}`
                            : ''}
                        </td>
                        <td>
                          <div className="admin-market-row-actions">
                            {item.status !== 'Verified' && (
                              <button
                                disabled={!!busy}
                                onClick={() =>
                                  void action(item.id, {
                                    action: 'verification-review',
                                    storeId: item.id,
                                    decision: 'approve',
                                  })
                                }
                              >
                                Approve
                              </button>
                            )}

                            {item.status !== 'Rejected' && (
                              <button
                                disabled={!!busy}
                                onClick={() => {
                                  const reason = window.prompt(
                                    item.status === 'Verified'
                                      ? 'Reason for removing verification:'
                                      : 'Reason for rejecting:',
                                  )

                                  if (reason && reason.trim().length >= 3) {
                                    void action(item.id, {
                                      action: 'verification-review',
                                      storeId: item.id,
                                      decision:
                                        item.status === 'Verified'
                                          ? 'revoke'
                                          : 'reject',
                                      reason,
                                    })
                                  }
                                }}
                              >
                                {item.status === 'Verified' ? 'Revoke' : 'Reject'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'payouts' && (
        <div className="admin-market-table-wrap">
          <h4>Seller payouts</h4>

          <p className="admin-market-note">
            Customer money is held until the buyer confirms receipt (or{' '}
            4 days after the seller marks the order delivered). Pay
            sellers from your Paystack balance once an order is
            &ldquo;Released&rdquo;, then mark it as paid out here.
          </p>

          {(() => {
            const paid = data.sellerOrders.filter(
              (order) => order.paymentStatus === 'Paid',
            )

            const state = (order: Row) => order.payoutStatus || 'Held'

            const amount = (order: Row) =>
              number(order.payoutAmount) || number(order.sellerNetAmount)

            const total = (status: string) =>
              paid
                .filter((order) => state(order) === status)
                .reduce((sum, order) => sum + amount(order), 0)

            const rank: Record<string, number> = {
              Disputed: 0,
              Released: 1,
              Held: 2,
              'Paid Out': 3,
              Cancelled: 4,
            }

            const rows = [...paid].sort(
              (a, b) =>
                (rank[state(a)] ?? 9) - (rank[state(b)] ?? 9) ||
                number(b.createdAt?.seconds) - number(a.createdAt?.seconds),
            )

            if (rows.length === 0) {
              return <p>No paid seller orders yet.</p>
            }

            return (
              <>
                <p>
                  <strong>Ready to pay out:</strong>{' '}
                  {money.format(total('Released'))} ·{' '}
                  <strong>Held:</strong> {money.format(total('Held'))} ·{' '}
                  <strong>Disputed:</strong>{' '}
                  {money.format(total('Disputed'))}
                </p>

                <table className="admin-market-table">
                  <thead>
                    <tr>
                      <th>Store</th>
                      <th>Pay to</th>
                      <th>Order</th>
                      <th>Payout</th>
                      <th>Delivery</th>
                      <th>Payout status</th>
                      <th>Details</th>
                      <th>Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((order) => {
                      const status = state(order)

                      return (
                        <tr key={order.id}>
                          <td>{order.storeName || '—'}</td>
                          <td>
                            {(() => {
                              const bank = data.sellerVerifications.find(
                                (entry) => entry.id === order.sellerId,
                              )

                              if (!bank) return 'No bank details yet'

                              return (
                                <>
                                  {bank.bankName} {bank.accountNumber}
                                  <small style={{ display: 'block', opacity: 0.7 }}>
                                    {bank.accountName || bank.legalName}
                                    {bank.status === 'Verified'
                                      ? ' · Verified'
                                      : ' · Not verified'}
                                  </small>
                                </>
                              )
                            })()}
                          </td>
                          <td>{order.orderId || order.id}</td>
                          <td>{money.format(amount(order))}</td>
                          <td>{order.status || '—'}</td>
                          <td>{status}</td>

                          <td>
                            {status === 'Disputed' &&
                              (order.disputeReason || 'Buyer reported a problem')}

                            {status === 'Held' && order.autoReleaseAt?.seconds
                              ? `Auto-releases ${dateText(order.autoReleaseAt)}`
                              : null}

                            {status === 'Released' &&
                              `${order.payoutReleaseReason || 'Released'} · ${dateText(order.payoutReleasedAt)}`}

                            {status === 'Paid Out' &&
                              `${dateText(order.payoutPaidAt)}${order.payoutReference ? ` · ${order.payoutReference}` : ''}`}
                          </td>

                          <td>
                            <div className="admin-market-row-actions">
                              {(status === 'Held' || status === 'Disputed') && (
                                <button
                                  disabled={!!busy}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        'Release this money to the seller now?',
                                      )
                                    ) {
                                      void action(order.id, {
                                        action: 'payout',
                                        operation: 'release',
                                        sellerOrderId: order.id,
                                      })
                                    }
                                  }}
                                >
                                  Release
                                </button>
                              )}

                              {status === 'Released' && (
                                <>
                                  <button
                                    disabled={!!busy}
                                    onClick={() => {
                                      const reference = window.prompt(
                                        'Transfer reference (optional):',
                                        '',
                                      )

                                      if (reference !== null) {
                                        void action(order.id, {
                                          action: 'payout',
                                          operation: 'mark-paid',
                                          sellerOrderId: order.id,
                                          reference,
                                        })
                                      }
                                    }}
                                  >
                                    Mark paid out
                                  </button>

                                  <button
                                    disabled={!!busy}
                                    onClick={() =>
                                      void action(order.id, {
                                        action: 'payout',
                                        operation: 'hold',
                                        sellerOrderId: order.id,
                                      })
                                    }
                                  >
                                    Hold
                                  </button>
                                </>
                              )}

                              {status === 'Disputed' && (
                                <button
                                  disabled={!!busy}
                                  onClick={() =>
                                    void action(order.id, {
                                      action: 'payout',
                                      operation: 'hold',
                                      sellerOrderId: order.id,
                                    })
                                  }
                                >
                                  Keep held
                                </button>
                              )}

                              {(status === 'Held' ||
                                status === 'Disputed' ||
                                status === 'Released') && (
                                <button
                                  disabled={!!busy}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        'Cancel this payout because the buyer is being refunded? The seller will not be paid.',
                                      )
                                    ) {
                                      void action(order.id, {
                                        action: 'payout',
                                        operation: 'cancel',
                                        sellerOrderId: order.id,
                                      })
                                    }
                                  }}
                                >
                                  Cancel (refund buyer)
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )
          })()}
        </div>
      )}

      {tab === 'transactions' && (
        <div className="admin-market-table-wrap">
          <h4>Payment transactions</h4>

          {data.transactions.length === 0 ? (
            <p>
              No payment transactions have been recorded.
              Paystack is not connected yet; this section
              will populate after verified payments are enabled.
            </p>
          ) : (
            <table className="admin-market-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Order</th>
                  <th>Amount</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {data.transactions.map((item) => (
                  <tr key={item.id}>
                    <td>{item.reference || item.id}</td>
                    <td>{item.orderId || '—'}</td>
                    <td>{money.format(number(item.amount))}</td>
                    <td>{item.provider || 'Paystack'}</td>
                    <td>{item.status}</td>
                    <td>{dateText(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'cases' && (
        <div className="admin-market-cases">
          <div className="admin-market-table-wrap">
            <h4>Refund requests</h4>

            {data.refunds.length === 0 ? (
              <p>No refund requests yet.</p>
            ) : (
              data.refunds.map((item) => (
                <article
                  className="admin-market-case"
                  key={item.id}
                >
                  <div>
                    <strong>Refund · {item.orderId}</strong>
                    <p>{item.reason}</p>
                    <small>
                      {money.format(number(item.amount))} ·{' '}
                      {dateText(item.createdAt)}
                    </small>
                  </div>

                  <select
                    aria-label="Refund status"
                    value={item.status || 'Requested'}
                    onChange={(event) =>
                      void action(item.id, {
                        action: 'caseStatus',
                        caseType: 'refund',
                        caseId: item.id,
                        status: event.target.value,
                      })
                    }
                  >
                    <option>Requested</option>
                    <option>Under Review</option>
                    <option>Approved</option>
                    <option>Rejected</option>
                    <option>Processing</option>
                    <option>Failed</option>
                  </select>
                </article>
              ))
            )}
          </div>

          <div className="admin-market-table-wrap">
            <h4>Disputes</h4>

            {data.disputes.length === 0 ? (
              <p>No disputes recorded yet.</p>
            ) : (
              data.disputes.map((item) => (
                <article
                  className="admin-market-case"
                  key={item.id}
                >
                  <div>
                    <strong>
                      Dispute · {item.orderId || item.id}
                    </strong>

                    <p>
                      {item.reason ||
                        item.description ||
                        'No description supplied.'}
                    </p>

                    <small>{dateText(item.createdAt)}</small>
                  </div>

                  <select
                    aria-label="Dispute status"
                    value={item.status || 'Open'}
                    onChange={(event) =>
                      void action(item.id, {
                        action: 'caseStatus',
                        caseType: 'dispute',
                        caseId: item.id,
                        status: event.target.value,
                      })
                    }
                  >
                    <option>Open</option>
                    <option>Under Review</option>
                    <option>Evidence Submitted</option>
                    <option>Won</option>
                    <option>Lost</option>
                    <option>Closed</option>
                  </select>
                </article>
              ))
            )}
          </div>

          <p className="admin-market-note">
            <ShieldAlert size={18} />

            Changing a refund case status records the
            administrative decision; it does not send money.
            Actual refunds require a connected provider and
            verified refund API response.
          </p>
        </div>
      )}
    </section>
  )
}
