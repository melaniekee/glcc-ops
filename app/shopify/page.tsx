import {
  getShopOverview,
  getSalesSummary,
  getLowStock,
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
  // core overview always renders.
  let sales = null
  try { sales = await getSalesSummary() } catch { /* hide sales cards */ }
  const lowStock = await getLowStock(5)

  const cards: [string, string | number][] = [
    ['Products', overview.productCount],
    ['Orders', overview.orderCount],
    ['Currency', overview.currency],
  ]

  const salesCards: [string, string][] = sales ? [
    ['Sales this month', money(sales.monthSales, sales.currency)],
    ['Total sales', money(sales.totalSales, sales.currency)],
    ['Unfulfilled orders', String(sales.unfulfilledCount)],
  ] : []

  return (
    <>
      <h1 className="ph">{overview.name}</h1>
      <p className="cap">{overview.domain}</p>
      <div className="grid">
        {cards.map(([l, v]) => (
          <div className="stat" key={l}><p className="l">{l}</p><p className="v">{v}</p></div>
        ))}
      </div>

      {salesCards.length > 0 && (
        <div className="grid">
          {salesCards.map(([l, v]) => (
            <div className="stat" key={l}><p className="l">{l}</p><p className="v">{v}</p></div>
          ))}
        </div>
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
