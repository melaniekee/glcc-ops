import {
  getRecentOrders,
  money,
  shopifyConfigured,
  shopifyTokenLooksValid,
} from '@/lib/shopify'
import ShopifyConnect from '@/app/_components/ShopifyConnect'

export const dynamic = 'force-dynamic'

// Your order pipeline, live from Shopify — recent orders grouped by where they
// are in fulfillment. Columns are ordered earliest → latest in the lifecycle.
const STAGES = [
  'unfulfilled', 'partially_fulfilled', 'in_progress', 'on_hold', 'scheduled', 'fulfilled', 'restocked',
]
const pretty = (s: string) => s.replace(/_/g, ' ')

export default async function Pipeline() {
  if (!shopifyConfigured || !shopifyTokenLooksValid()) {
    return <ShopifyConnect title="Pipeline" cap="Your orders by fulfillment status" />
  }

  let orders
  try {
    orders = await getRecentOrders(50)
  } catch (e) {
    return <ShopifyConnect title="Pipeline" cap="Your orders by fulfillment status" error={(e as Error).message} />
  }

  // Show known stages in order, then any other status the store actually uses.
  const present = STAGES.filter(st => orders.some(o => o.fulfillmentStatus === st))
  const extras = [...new Set(orders.map(o => o.fulfillmentStatus))].filter(st => !STAGES.includes(st))
  const stages = [...present, ...extras]

  return (
    <>
      <h1 className="ph">Pipeline</h1>
      <p className="cap">Your orders, grouped by fulfillment status</p>
      {orders.length === 0 ? (
        <p className="empty">No orders yet — they&apos;ll appear here as they come in.</p>
      ) : (
        <div className="cols">
          {stages.map(st => {
            const items = orders.filter(o => o.fulfillmentStatus === st)
            return (
              <div className="col" key={st}>
                <h3>{pretty(st)} · {items.length}</h3>
                {items.map(o => (
                  <div className="kc" key={o.name}>
                    <p className="t">{o.name}</p>
                    <p className="s">{money(o.amount, o.currency)} · {o.financialStatus}</p>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
