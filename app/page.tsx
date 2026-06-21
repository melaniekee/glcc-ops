import {
  getShopOverview,
  getSalesSummary,
  money,
  shopifyConfigured,
  shopifyTokenLooksValid,
} from '@/lib/shopify'
import ShopifyConnect from '@/app/_components/ShopifyConnect'

export const dynamic = 'force-dynamic'

// Home / glance. Fed live from your Shopify store (not the demo records table).
export default async function Dashboard() {
  if (!shopifyConfigured || !shopifyTokenLooksValid()) {
    return <ShopifyConnect title="Dashboard" cap="Your store at a glance" />
  }

  let overview
  try {
    overview = await getShopOverview()
  } catch (e) {
    return <ShopifyConnect title="Dashboard" cap="Your store at a glance" error={(e as Error).message} />
  }

  // Best-effort: if the sales aggregate fails, the page still shows the overview.
  let sales = null
  try { sales = await getSalesSummary() } catch { /* hide sales-derived cards */ }

  const cards: [string, string | number][] = [
    ['Orders', overview.orderCount],
    ['Sales this month', sales ? money(sales.monthSales, sales.currency) : '—'],
    ['Avg order value', sales ? money(sales.avgOrderValue, sales.currency) : '—'],
    ['Unfulfilled', sales ? sales.unfulfilledCount : '—'],
  ]

  return (
    <>
      <h1 className="ph">{overview.name}</h1>
      <p className="cap">Your store at a glance</p>
      <div className="grid">
        {cards.map(([l, v]) => (
          <div className="stat" key={l}><p className="l">{l}</p><p className="v">{v}</p></div>
        ))}
      </div>

      <h2 className="ph" style={{ fontSize: '1.1rem', marginTop: '1.5rem' }}>Recent orders</h2>
      {overview.recentOrders.length === 0 ? (
        <p className="empty">No orders yet — they&apos;ll show up here as they come in.</p>
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
