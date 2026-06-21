import {
  getSalesSummary,
  getRecentOrders,
  money,
  shopifyConfigured,
  shopifyTokenLooksValid,
} from '@/lib/shopify'
import ShopifyConnect from '@/app/_components/ShopifyConnect'

export const dynamic = 'force-dynamic'

// Real revenue, live from Shopify (post-refund, matching Shopify's Total sales).
export default async function Money() {
  if (!shopifyConfigured || !shopifyTokenLooksValid()) {
    return <ShopifyConnect title="Money" cap="Real revenue from your Shopify store" />
  }

  let sales
  try {
    sales = await getSalesSummary()
  } catch (e) {
    return <ShopifyConnect title="Money" cap="Real revenue from your Shopify store" error={(e as Error).message} />
  }

  // Recent orders double as your "invoices". Best-effort — hide the table on failure.
  let orders: Awaited<ReturnType<typeof getRecentOrders>> = []
  try { orders = await getRecentOrders(20) } catch { /* keep the cards, drop the list */ }

  const cards: [string, string][] = [
    ['Sales this month', money(sales.monthSales, sales.currency)],
    ['Last 7 days', money(sales.last7Sales, sales.currency)],
    ['Avg order value', money(sales.avgOrderValue, sales.currency)],
  ]
  const statusCards: [string, string][] = [
    ['Paid', String(sales.paidCount)],
    ['Pending', String(sales.pendingCount)],
    ['Refunded', String(sales.refundedCount)],
  ]

  return (
    <>
      <h1 className="ph">Money</h1>
      <p className="cap">Real revenue from your Shopify store</p>
      <div className="grid">
        {cards.map(([l, v]) => (
          <div className="stat" key={l}><p className="l">{l}</p><p className="v">{v}</p></div>
        ))}
      </div>
      <div className="grid">
        {statusCards.map(([l, v]) => (
          <div className="stat" key={l}><p className="l">{l}</p><p className="v">{v}</p></div>
        ))}
      </div>

      <h2 className="ph" style={{ fontSize: '1.1rem', marginTop: '1.5rem' }}>Recent orders</h2>
      {orders.length === 0 ? (
        <p className="empty">No orders to show yet.</p>
      ) : (
        <table className="tbl">
          <thead><tr><th>Order</th><th>Status</th><th>Amount</th><th>Date</th></tr></thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.name}>
                <td>{o.name}</td>
                <td data-label="Status"><span className={`pill ${o.financialStatus}`}>{o.financialStatus}</span></td>
                <td data-label="Amount">{money(o.amount, o.currency)}</td>
                <td data-label="Date">{new Date(o.createdAt).toLocaleDateString('en-MY')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
