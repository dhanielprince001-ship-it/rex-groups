
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
    settings: [{ commissionPercent: 10 }],
  })

  const [commission, setCommission] = useState('10')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [tab, setTab] = useState<
    'overview' | 'sellers' | 'orders' | 'transactions' | 'cases'
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

      setData({
        stores: result.stores || [],
        profiles: result.profiles || [],
        orders: result.orders || [],
        sellerOrders: result.sellerOrders || [],
        transactions: result.transactions || [],
        refunds: result.refunds || [],
        disputes: result.disputes || [],
        settings: result.settings || [{ commissionPercent: 10 }],
      })

      setCommission(
        String(result.settings?.[0]?.commissionPercent ?? 10),
      )
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
            'orders',
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
