import { sendMessage } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

// The Y step: a Vercel Cron hits this once a day (08:00 Malaysia / 00:00 UTC) and
// texts the owner a Shopify morning brief — order counts, revenue, customer insights.
// Same auth model as /api/digest: if CRON_SECRET is set, Vercel Cron sends it as a
// Bearer token and this route rejects anyone else.
//
// Env (same names as lib/shopify.ts — reuses your existing Shopify connection):
//   SHOPIFY_STORE_DOMAIN     e.g. your-store.myshopify.com
//   SHOPIFY_ADMIN_API_TOKEN  the Admin API access token (starts with shpat_)
//   SHOPIFY_API_VERSION      optional, defaults to 2025-10
//
// NOTE: the customer-insights block needs the `read_customers` scope. If your app
// only has read_orders, the orders section still sends and the customer section
// shows a one-line hint instead of failing the whole brief.

// Self-contained Admin GraphQL caller (kept inline so this route has no dependency
// on lib/shopify.ts, which isn't on this branch yet). Mirrors that file's env names
// and domain cleaning so it slots into your existing Shopify setup unchanged.
async function shopify(query: string) {
  const domain = (process.env.SHOPIFY_STORE_DOMAIN ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
  const token = (process.env.SHOPIFY_ADMIN_API_TOKEN ?? '').trim()
  const version = (process.env.SHOPIFY_API_VERSION ?? '').trim() || '2025-10'
  if (!domain || !token) throw new Error('Shopify env vars not set (SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN)')

  const res = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query }),
    cache: 'no-store',
  })
  if (res.status === 401 || res.status === 403) {
    throw new Error('Shopify rejected the token (401/403) — check SHOPIFY_ADMIN_API_TOKEN and app scopes.')
  }
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status} — check SHOPIFY_STORE_DOMAIN / SHOPIFY_API_VERSION.`)
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors.map((e: { message: string }) => e.message).join('; '))
  return json.data
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('forbidden', { status: 401 })
  }

  const owner = process.env.OWNER_CHAT_ID?.trim()
  if (!owner) return Response.json({ ok: false, reason: 'no OWNER_CHAT_ID' })

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const since48 = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // start of "yesterday's 24h"

  try {
    // --- Orders + revenue (needs read_orders) -------------------------------
    const counts = await shopify(`{
      total:       ordersCount(query: "created_at:>='${since}'") { count }
      fulfilled:   ordersCount(query: "created_at:>='${since}' AND fulfillment_status:fulfilled") { count }
      unfulfilled: ordersCount(query: "created_at:>='${since}' AND fulfillment_status:unfulfilled") { count }
    }`)

    // currentTotalPriceSet = total after refunds/edits, so "Revenue" matches
    // Shopify's Total sales (same basis as the /shopify dashboard).
    const rev = await shopify(`{
      orders(first: 100, query: "created_at:>='${since}'") {
        nodes { currentTotalPriceSet { shopMoney { amount currencyCode } } }
      }
    }`)
    const revNodes = (rev.orders?.nodes ?? []) as Array<{ currentTotalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } } }>
    const currency = revNodes[0]?.currentTotalPriceSet?.shopMoney?.currencyCode ?? 'MYR'
    const revenue = revNodes.reduce((s, n) => s + parseFloat(n.currentTotalPriceSet?.shopMoney?.amount ?? '0'), 0)

    // --- Top seller of the day (by units) ------------------------------------
    // Separate, smaller query: nesting lineItems inside orders multiplies the
    // Shopify query cost (orders×lineItems), so we keep both first: counts small
    // to stay well under the 1000-point single-query cap. Degrade if rejected.
    let topSellerLine = ''
    try {
      const ls = await shopify(`{
        orders(first: 30, query: "created_at:>='${since}'") {
          nodes { lineItems(first: 20) { nodes { title quantity } } }
        }
      }`)
      const unitsByProduct: Record<string, number> = {}
      for (const n of (ls.orders?.nodes ?? []) as Array<{ lineItems?: { nodes?: Array<{ title?: string; quantity?: number }> } }>) {
        for (const li of n.lineItems?.nodes ?? []) {
          if (li.title) unitsByProduct[li.title] = (unitsByProduct[li.title] ?? 0) + (li.quantity ?? 0)
        }
      }
      const topSeller = Object.entries(unitsByProduct).sort((a, b) => b[1] - a[1])[0]
      if (topSeller) topSellerLine = `🏆 Top seller: ${topSeller[0]} (${topSeller[1]} sold)\n`
    } catch { /* hide the line if the query is rejected */ }

    // --- Sales vs yesterday (the 24h before this one) — degrade if rejected ---
    let trendLine = ''
    try {
      const prior = await shopify(`{
        orders(first: 100, query: "created_at:>='${since48}' AND created_at:<'${since}'") {
          nodes { currentTotalPriceSet { shopMoney { amount } } }
        }
      }`)
      const priorRevenue = ((prior.orders?.nodes ?? []) as Array<{ currentTotalPriceSet?: { shopMoney?: { amount?: string } } }>)
        .reduce((s, n) => s + parseFloat(n.currentTotalPriceSet?.shopMoney?.amount ?? '0'), 0)
      const delta = revenue - priorRevenue
      const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '▬'
      const pct = priorRevenue > 0 ? ` (${delta >= 0 ? '+' : ''}${Math.round((delta / priorRevenue) * 100)}%)` : ''
      trendLine = `📊 vs yesterday: ${arrow} ${currency} ${Math.abs(delta).toFixed(2)}${pct}\n`
    } catch { /* hide the line if the query is rejected */ }

    // --- Abandoned carts (needs read_orders, which you have) — degrade if the
    // store/permission blocks it, so it never fails the whole brief. -----------
    let abandonedLine = ''
    try {
      const ab = await shopify(`{ abandonedCheckoutsCount { count } }`)
      const n = ab.abandonedCheckoutsCount?.count ?? 0
      if (n > 0) abandonedLine = `🛒 Abandoned carts: ${n}\n`
    } catch { /* hide the line if the query is rejected */ }

    // --- Customer insights (needs read_customers) — degrade if not granted ---
    let customerSection: string
    try {
      const cust = await shopify(`{
        newCust: customersCount(query: "created_at:>='${since}'") { count }
        allCust: customersCount { count }
      }`)
      const topData = await shopify(`{
        orders(first: 100, query: "created_at:>='${since}'") {
          nodes { totalPriceSet { shopMoney { amount } } customer { displayName } }
        }
      }`)
      const spend: Record<string, number> = {}
      for (const n of (topData.orders?.nodes ?? []) as Array<{ totalPriceSet?: { shopMoney?: { amount?: string } }; customer?: { displayName?: string } }>) {
        const name = n.customer?.displayName
        if (name) spend[name] = (spend[name] ?? 0) + parseFloat(n.totalPriceSet?.shopMoney?.amount ?? '0')
      }
      const top = Object.entries(spend).sort((a, b) => b[1] - a[1])[0]
      customerSection =
        `👥 <b>Customers</b>\n` +
        `  🆕 New (last 24h): ${cust.newCust.count}\n` +
        `  📊 Total: ${cust.allCust.count}` +
        (top ? `\n  🏆 Top buyer: ${top[0]} (${currency} ${top[1].toFixed(2)})` : '')
    } catch {
      customerSection = `👥 <b>Customers</b>\n  ℹ️ Add the <code>read_customers</code> scope to your Shopify app to unlock customer insights.`
    }

    const today = new Date().toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur',
    })

    const msg =
      `🛍️ <b>Shopify brief</b> — ${today}\n\n` +
      `📦 <b>Orders</b> (last 24h): ${counts.total.count}\n` +
      `  ✅ Fulfilled: ${counts.fulfilled.count}\n` +
      `  ⏳ Unfulfilled: ${counts.unfulfilled.count}\n` +
      `💰 Revenue: ${currency} ${revenue.toFixed(2)}\n` +
      trendLine +
      topSellerLine +
      abandonedLine +
      `\n` +
      customerSection

    await sendMessage(owner, msg)
    return Response.json({ ok: true, sent: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    await sendMessage(owner, `⚠️ Shopify brief failed: ${message}`)
    return Response.json({ ok: false, error: message })
  }
}
