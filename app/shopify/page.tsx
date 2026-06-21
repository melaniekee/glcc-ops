import {
  getShopOverview,
  getSalesSummary,
  getLowStock,
  getTopSellers,
  getAbandonedCheckouts,
  getReturningCustomers,
  money,
  shopifyConfigured,
  shopifyTokenLooksValid,
} from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// Your store at a glance, pulled live from the Shopify Admin API.
export default async function Shopify() {
  // 1) Not wired yet → friendly connect banner (no doomed request).
  if (!shopifyConfigured) {
    return (
      <>
        <h1 className="ph">Shopify</h1>
        <p className="cap">Your store at a glance</p>
        <div className="banner">
          🛍️ Shopify not connected. In your <code>.env</code> set{' '}
          <code>SHOPIFY_STORE_DOMAIN</code>, <code>SHOPIFY_CLIENT_ID</code> and{' '}
          <code>SHOPIFY_CLIENT_SECRET</code> (from your Dev Dashboard app →{' '}
          <b>Settings → Credentials</b>), restart the server, then visit{' '}
          <code><a href="/api/shopify/install">/api/shopify/install</a></code> once to mint the
          access token and paste it into <code>SHOPIFY_ADMIN_API_TOKEN</code>.
          <br />On <b>Vercel</b>: add them in <b>Settings → Environment Variables</b>, then <b>Redeploy</b>.
        </div>
      </>
    )
  }

  // 2) Wrong token shape → say so plainly before the request fails confusingly.
  if (!shopifyTokenLooksValid()) {
    return (
      <>
        <h1 className="ph">Shopify</h1>
        <p className="cap">Your store at a glance</p>
        <div className="banner">
          ⚠️ That <code>SHOPIFY_ADMIN_API_TOKEN</code> looks too short to be a real access token —
          it's probably the Client ID or API secret key by mistake. Re-run{' '}
          <code><a href="/api/shopify/install">/api/shopify/install</a></code> to mint a proper token.
        </div>
      </>
    )
  }

  // 3) Configured → fetch. On any API error, degrade to a banner, not a crash.
  let overview
  try {
    overview = await getShopOverview()
  } catch (e) {
    return (
      <>
        <h1 className="ph">Shopify</h1>
        <p className="cap">Your store at a glance</p>
        <div className="banner">⚠️ {(e as Error).message}</div>
      </>
    )
  }

  // Best-effort extras — each degrades to nothing if its query fails, so the
  // core overview always renders. Fetch them in parallel.
  let sales = null
  try { sales = await getSalesSummary() } catch { /* hide sales cards */ }
  const [lowStock, topSellers, abandoned, customers] = await Promise.all([
    getLowStock(5),
    getTopSellers(5),
    getAbandonedCheckouts(),
    getReturningCustomers(),
  ])

  const cards: [string, string | number][] = [
    ['Products', overview.productCount],
    ['Orders', overview.orderCount],
    ['Currency', overview.currency],
  ]

  // Tiny trend arrow comparing the last 7 days to the 7 days before.
  const trend = sales
    ? sales.last7Sales > sales.prior7Sales ? ' ▲'
    : sales.last7Sales < sales.prior7Sales ? ' ▼' : ''
    : ''

  const salesCards: [string, string][] = sales ? [
    ['Sales this month', money(sales.monthSales, sales.currency)],
    ['Avg order value', money(sales.avgOrderValue, sales.currency)],
    ['Last 7 days', money(sales.last7Sales, sales.currency) + trend],
    ['Unfulfilled orders', String(sales.unfulfilledCount)],
  ] : []

  const customerCards: [string, string][] = customers ? [
    ['Total customers', String(customers.total)],
    ['Returning customers', String(customers.returning)],
  ] : []

  const todayCards: [string, string][] = sales ? [
    ['Orders today', String(sales.todayCount)],
    ['Sales today', money(sales.todaySales, sales.currency)],
  ] : []

  const statusCards: [string, string][] = sales ? [
    ['Paid', String(sales.paidCount)],
    ['Pending', String(sales.pendingCount)],
    ['Refunded', String(sales.refundedCount)],
  ] : []

  // Scale the 7-day bar chart to its busiest day (avoid divide-by-zero).
  const maxDay = sales ? Math.max(1, ...sales.daily.map(d => d.sales)) : 1

  return (
    <>
      <h1 className="ph">{overview.name}</h1>
      <p className="cap">{overview.domain}</p>
      <div className="grid">
        {cards.map(([l, v]) => (
          <div className="stat" key={l}><p className="l">{l}</p><p className="v">{v}</p></div>
        ))}
      </div>

      {todayCards.length > 0 && (
        <div className="grid">
          {todayCards.map(([l, v]) => (
            <div className="stat" key={l}><p className="l">{l}</p><p className="v">{v}</p></div>
          ))}
        </div>
      )}

      {salesCards.length > 0 && (
        <div className="grid">
          {salesCards.map(([l, v]) => (
            <div className="stat" key={l}><p className="l">{l}</p><p className="v">{v}</p></div>
          ))}
        </div>
      )}

      {statusCards.length > 0 && (
        <div className="grid">
          {statusCards.map(([l, v]) => (
            <div className="stat" key={l}><p className="l">{l}</p><p className="v">{v}</p></div>
          ))}
        </div>
      )}

      {customerCards.length > 0 && (
        <div className="grid">
          {customerCards.map(([l, v]) => (
            <div className="stat" key={l}><p className="l">{l}</p><p className="v">{v}</p></div>
          ))}
        </div>
      )}

      {sales && sales.daily.some(d => d.sales > 0) && (
        <>
          <h2 className="ph" style={{ fontSize: '1.1rem', marginTop: '1.5rem' }}>📈 Sales — last 7 days</h2>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 140, padding: '0.5rem 0' }}>
            {sales.daily.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.7rem', opacity: 0.7, whiteSpace: 'nowrap' }}>{money(d.sales, sales.currency)}</span>
                <div
                  title={`${d.label}: ${money(d.sales, sales.currency)}`}
                  style={{
                    width: '100%',
                    height: `${Math.max(2, Math.round((d.sales / maxDay) * 100))}%`,
                    minHeight: 2,
                    background: 'var(--accent, #5b8def)',
                    borderRadius: '4px 4px 0 0',
                    opacity: d.sales > 0 ? 1 : 0.25,
                  }}
                />
                <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{d.label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {sales && sales.ordersToShip.length > 0 && (
        <>
          <h2 className="ph" style={{ fontSize: '1.1rem', marginTop: '1.5rem' }}>📦 Orders to ship (paid, unfulfilled)</h2>
          <table className="tbl">
            <thead><tr><th>Order</th><th>Total</th><th>Paid on</th></tr></thead>
            <tbody>
              {sales.ordersToShip.slice(0, 8).map(o => (
                <tr key={o.name}>
                  <td>{o.name}</td>
                  <td data-label="Total">{money(o.amount, o.currency)}</td>
                  <td data-label="Paid on">{new Date(o.createdAt).toLocaleDateString('en-MY')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {topSellers && topSellers.length > 0 && (
        <>
          <h2 className="ph" style={{ fontSize: '1.1rem', marginTop: '1.5rem' }}>🏆 Top sellers (recent orders)</h2>
          <table className="tbl">
            <thead><tr><th>Product</th><th>Units sold</th><th>Revenue</th></tr></thead>
            <tbody>
              {topSellers.map((p, i) => (
                <tr key={i}>
                  <td>{p.title}</td>
                  <td data-label="Units sold"><span className="pill paid">{p.units}</span></td>
                  <td data-label="Revenue">{money(p.revenue, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {abandoned && abandoned.count > 0 && (
        <>
          <h2 className="ph" style={{ fontSize: '1.1rem', marginTop: '1.5rem' }}>🛒 Abandoned carts ({abandoned.count})</h2>
          {abandoned.recent.length === 0 ? (
            <p className="empty">No recent abandoned checkouts to show.</p>
          ) : (
            <table className="tbl">
              <thead><tr><th>Cart value</th><th>Started</th><th>Recover</th></tr></thead>
              <tbody>
                {abandoned.recent.map((c, i) => (
                  <tr key={i}>
                    <td>{money(c.total, c.currency)}</td>
                    <td data-label="Started">{new Date(c.createdAt).toLocaleDateString('en-MY')}</td>
                    <td data-label="Recover">{c.recoveryUrl
                      ? <a href={c.recoveryUrl} target="_blank" rel="noreferrer">link ↗</a>
                      : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {lowStock && lowStock.length > 0 && (
        <>
          <h2 className="ph" style={{ fontSize: '1.1rem', marginTop: '1.5rem' }}>Low stock (≤ 5 left)</h2>
          <table className="tbl">
            <thead><tr><th>Product</th><th>Units left</th></tr></thead>
            <tbody>
              {lowStock.map((p, i) => (
                <tr key={i}>
                  <td>{p.title}</td>
                  <td data-label="Units left"><span className={`pill ${p.qty <= 0 ? 'overdue' : 'pending'}`}>{p.qty}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h2 className="ph" style={{ fontSize: '1.1rem', marginTop: '1.5rem' }}>Recent orders</h2>
      {overview.recentOrders.length === 0 ? (
        <p className="empty">No orders yet — they'll show up here as they come in.</p>
      ) : (
        <table className="tbl">
          <thead><tr><th>Order</th><th>Status</th><th>Total</th><th>Date</th></tr></thead>
          <tbody>
            {overview.recentOrders.map(o => (
              <tr key={o.name}>
                <td>{o.name}</td>
                <td data-label="Status"><span className={`pill ${o.financialStatus}`}>{o.financialStatus}</span></td>
                <td data-label="Total">{money(o.amount, o.currency)}</td>
                <td data-label="Date">{new Date(o.createdAt).toLocaleDateString('en-MY')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
