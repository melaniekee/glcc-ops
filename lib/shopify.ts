// Server-only Shopify Admin API client.
//
// This talks to your store's Admin GraphQL API using a custom-app access token.
// The token can read/write your whole store, so this file must NEVER be imported
// into a "use client" component. Keep it server-side (same rule as lib/supabase.ts).
//
// Where the env values come from (see .env.example for full notes):
//   SHOPIFY_STORE_DOMAIN   e.g. whattowear-mel.myshopify.com
//   SHOPIFY_ADMIN_API_TOKEN  the "Admin API access token" (starts with shpat_)
//   SHOPIFY_API_VERSION    optional, defaults below to a recent stable version

// Clean the env values so the most common copy-paste mistakes don't break things:
//  • .trim() strips a stray newline/space (illegal in an HTTP header, would crash
//    every request with "invalid header value").
//  • the domain is normalised: we strip a pasted https:// prefix and any trailing
//    slash, so both "https://shop.myshopify.com/" and "shop.myshopify.com" work.
const cleanDomain = (process.env.SHOPIFY_STORE_DOMAIN ?? '')
  .trim()
  .replace(/^https?:\/\//i, '')   // drop a pasted protocol
  .replace(/\/+$/, '')            // drop trailing slash(es)
const cleanToken = (process.env.SHOPIFY_ADMIN_API_TOKEN ?? '').trim()
const apiVersion = (process.env.SHOPIFY_API_VERSION ?? '').trim() || '2025-10'

// OAuth credentials for the Dev Dashboard app (used by /api/shopify/install +
// /api/shopify/callback to mint the offline access token above). The Client ID is
// public; the Client secret is sensitive — server-only, never sent to the browser.
const cleanClientId = (process.env.SHOPIFY_CLIENT_ID ?? '').trim()
const cleanClientSecret = (process.env.SHOPIFY_CLIENT_SECRET ?? '').trim()
const cleanScopes = (process.env.SHOPIFY_SCOPES ?? '').trim() || 'read_products,read_orders'

// Bundled config the OAuth route handlers read. Kept here so there's ONE place
// that cleans/normalises every Shopify env value.
export const shopifyOAuth = {
  domain: cleanDomain,
  clientId: cleanClientId,
  clientSecret: cleanClientSecret,
  scopes: cleanScopes,
  apiVersion,
}

// Can we even start the OAuth flow? (Domain + client id + secret present.)
export const shopifyOAuthConfigured = Boolean(
  cleanDomain && cleanClientId && cleanClientSecret &&
  /\.myshopify\.com$/i.test(cleanDomain),
)

// "Configured" = REAL, non-placeholder values present. Used to show the connect
// banner INSTANTLY instead of firing a doomed request when the token is missing.
export const shopifyConfigured = Boolean(
  cleanDomain && cleanToken &&
  /\.myshopify\.com$/i.test(cleanDomain) &&
  !/YOUR-STORE|placeholder/i.test(cleanDomain) &&
  !/placeholder/i.test(cleanToken),
)

// Best-effort sanity check on the access token. Legacy custom-app tokens start
// with "shpat_"; OAuth offline tokens (from /api/shopify/callback) are opaque and
// may not, so we only reject values that are obviously NOT a token — e.g. someone
// pasted the short Client ID / API secret key by mistake. A real token is long.
export function shopifyTokenLooksValid(): boolean {
  return cleanToken.startsWith('shpat_') || cleanToken.length >= 30
}

if ((cleanDomain || cleanToken) && !shopifyConfigured) {
  console.warn('[GLCC] SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_API_TOKEN look incomplete — check .env.')
}

// Low-level Admin GraphQL call. Returns parsed `data`, or throws with a readable
// message (auth failure, GraphQL errors, network/timeout). Callers catch and the
// page degrades to a banner rather than a stack trace.
export async function shopifyGraphQL<T = any>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(
    `https://${cleanDomain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': cleanToken,
      },
      body: JSON.stringify({ query, variables }),
      // Cap each request at 8s so a wrong domain fails fast instead of hanging.
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    },
  )

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'Shopify rejected the token (401/403). Make sure SHOPIFY_ADMIN_API_TOKEN is the ' +
      '"Admin API access token" (starts with shpat_) and that the app has the read_products / read_orders scopes.',
    )
  }
  if (!res.ok) {
    throw new Error(`Shopify HTTP ${res.status} — check SHOPIFY_STORE_DOMAIN and SHOPIFY_API_VERSION.`)
  }

  const json = await res.json()
  if (json.errors?.length) {
    throw new Error('Shopify GraphQL error: ' + json.errors.map((e: any) => e.message).join('; '))
  }
  return json.data as T
}

// ---- Shapes the dashboard page uses ----------------------------------------

export type ShopOrder = {
  name: string            // e.g. "#1001"
  createdAt: string
  financialStatus: string // PAID, PENDING, REFUNDED, ...
  amount: number
  currency: string
}

export type ShopOverview = {
  name: string
  currency: string
  domain: string
  productCount: number
  orderCount: number
  recentOrders: ShopOrder[]
}

// One round-trip that fills the whole overview page. Requires the app to have at
// least read_products and read_orders scopes.
export async function getShopOverview(): Promise<ShopOverview> {
  const data = await shopifyGraphQL<{
    shop: { name: string; currencyCode: string; myshopifyDomain: string }
    productsCount: { count: number }
    ordersCount: { count: number }
    orders: { edges: { node: {
      name: string
      createdAt: string
      displayFinancialStatus: string | null
      totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
    } }[] }
  }>(`
    query ShopOverview {
      shop { name currencyCode myshopifyDomain }
      productsCount { count }
      ordersCount { count }
      orders(first: 5, sortKey: CREATED_AT, reverse: true) {
        edges { node {
          name
          createdAt
          displayFinancialStatus
          totalPriceSet { shopMoney { amount currencyCode } }
        } }
      }
    }
  `)

  return {
    name: data.shop.name,
    currency: data.shop.currencyCode,
    domain: data.shop.myshopifyDomain,
    productCount: data.productsCount.count,
    orderCount: data.ordersCount.count,
    recentOrders: data.orders.edges.map(({ node }) => ({
      name: node.name,
      createdAt: node.createdAt,
      financialStatus: (node.displayFinancialStatus ?? 'unknown').toLowerCase(),
      amount: Number(node.totalPriceSet.shopMoney.amount || 0),
      currency: node.totalPriceSet.shopMoney.currencyCode,
    })),
  }
}

// A single order row for the order-list tabs (Money invoices, Pipeline kanban,
// Dashboard recent). Money is currentTotalPriceSet (post-refund) to match the
// sales figures elsewhere.
export type OrderRow = {
  name: string
  createdAt: string
  financialStatus: string
  fulfillmentStatus: string
  amount: number
  currency: string
}

// The most recent `limit` orders (capped 1–250). One cheap query, no nested
// connections, so it stays well under Shopify's query-cost cap.
export async function getRecentOrders(limit = 25): Promise<OrderRow[]> {
  const first = Math.min(Math.max(Math.trunc(limit), 1), 250)
  const data = await shopifyGraphQL<{
    orders: { edges: { node: {
      name: string
      createdAt: string
      displayFinancialStatus: string | null
      displayFulfillmentStatus: string | null
      currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
    } }[] }
  }>(`
    query RecentOrders {
      orders(first: ${first}, sortKey: CREATED_AT, reverse: true) {
        edges { node {
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          currentTotalPriceSet { shopMoney { amount currencyCode } }
        } }
      }
    }
  `)
  return data.orders.edges.map(({ node }) => ({
    name: node.name,
    createdAt: node.createdAt,
    financialStatus: (node.displayFinancialStatus ?? 'unknown').toLowerCase(),
    fulfillmentStatus: (node.displayFulfillmentStatus ?? 'unfulfilled').toLowerCase(),
    amount: Number(node.currentTotalPriceSet.shopMoney.amount || 0),
    currency: node.currentTotalPriceSet.shopMoney.currencyCode,
  }))
}

// Format an amount in a given ISO currency (the store may not be in RM).
export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(amount || 0)
  } catch {
    return `${currency} ${Number(amount || 0).toLocaleString('en-MY')}`
  }
}

// ---- Extra analytics for the dashboard --------------------------------------

// One paid-but-unfulfilled order — your "ship this now" list.
export type ShipOrder = { name: string; amount: number; currency: string; createdAt: string }

// One day's sales total — used for the 7-day bar chart on the page.
export type DayBucket = { label: string; sales: number }

// NOTE on the money fields below: every sales sum uses each order's
// `currentTotalPriceSet` — the total AFTER refunds and order edits — so the
// figures line up with Shopify's "Total sales" report (which subtracts returns)
// rather than over-counting refunded orders at their original value.
export type SalesSummary = {
  currency: string
  monthSales: number      // sum of orders created this calendar month (store-local / MYT)
  totalSales: number      // sum across the most recent 250 orders (= all-time for small stores)
  unfulfilledCount: number
  avgOrderValue: number   // totalSales / number of orders in the window
  last7Sales: number      // sum of orders created in the last 7 days
  prior7Sales: number     // sum of the 7 days before that (so the page can show a trend)
  ordersToShip: ShipOrder[] // PAID + UNFULFILLED, oldest first — the queue to clear
  todaySales: number      // sum of orders created today (store-local day)
  todayCount: number      // number of orders created today
  daily: DayBucket[]      // last 7 days, oldest → newest, for the bar chart
  paidCount: number       // financial status breakdown across the window
  pendingCount: number
  refundedCount: number
}

// Short store-local day key + weekday label (so "today" lines up with MYT, not UTC).
const dayKey = (d: Date) =>
  d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }) // YYYY-MM-DD
const dayLabel = (d: Date) =>
  d.toLocaleDateString('en-MY', { weekday: 'short', timeZone: 'Asia/Kuala_Lumpur' })

// Sales + averages + status breakdown + a 7-day chart + a ship-now queue. Pulls up
// to 250 recent orders and aggregates in JS (the Admin API has no simple SUM). 250
// covers every order for small stores; a high-volume store would need pagination.
// Money is summed from currentTotalPriceSet (post-refund) and the month is bucketed
// in store-local (MYT) time, so the totals match Shopify's "Total sales" report.
export async function getSalesSummary(): Promise<SalesSummary> {
  const data = await shopifyGraphQL<{
    orders: { edges: { node: {
      name: string
      createdAt: string
      displayFinancialStatus: string | null
      displayFulfillmentStatus: string | null
      currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
    } }[] }
  }>(`
    query SalesSummary {
      orders(first: 250, sortKey: CREATED_AT, reverse: true) {
        edges { node {
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          currentTotalPriceSet { shopMoney { amount currencyCode } }
        } }
      }
    }
  `)

  const now = Date.now()
  const day = 864e5
  const todayKey = dayKey(new Date())
  const monthKey = todayKey.slice(0, 7) // 'YYYY-MM' in store-local (MYT) time

  // Pre-build 7 day buckets (oldest → newest) keyed by store-local date.
  const daily: DayBucket[] = []
  const dayIndex = new Map<string, number>()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * day)
    dayIndex.set(dayKey(d), daily.length)
    daily.push({ label: dayLabel(d), sales: 0 })
  }

  let monthSales = 0
  let totalSales = 0
  let last7Sales = 0
  let prior7Sales = 0
  let todaySales = 0
  let todayCount = 0
  let unfulfilledCount = 0
  let paidCount = 0
  let pendingCount = 0
  let refundedCount = 0
  let currency = 'MYR'
  const ordersToShip: ShipOrder[] = []

  for (const { node } of data.orders.edges) {
    const amt = Number(node.currentTotalPriceSet.shopMoney.amount || 0)
    const cur = node.currentTotalPriceSet.shopMoney.currencyCode || currency
    currency = cur
    const created = new Date(node.createdAt)
    const ts = created.getTime()
    totalSales += amt
    if (dayKey(created).slice(0, 7) === monthKey) monthSales += amt
    if (ts >= now - 7 * day) last7Sales += amt
    else if (ts >= now - 14 * day) prior7Sales += amt
    if (dayKey(created) === todayKey) { todaySales += amt; todayCount++ }
    const di = dayIndex.get(dayKey(created))
    if (di !== undefined) daily[di].sales += amt

    const financial = (node.displayFinancialStatus ?? '').toUpperCase()
    if (financial === 'PAID') paidCount++
    else if (financial.includes('REFUND')) refundedCount++
    else if (['PENDING', 'AUTHORIZED', 'PARTIALLY_PAID'].includes(financial)) pendingCount++

    if ((node.displayFulfillmentStatus ?? '').toUpperCase() === 'UNFULFILLED') {
      unfulfilledCount++
      if (financial === 'PAID') {
        ordersToShip.push({ name: node.name, amount: amt, currency: cur, createdAt: node.createdAt })
      }
    }
  }

  const count = data.orders.edges.length
  // Oldest first: the order that's been waiting longest should ship first.
  ordersToShip.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))

  return {
    currency,
    monthSales,
    totalSales,
    unfulfilledCount,
    avgOrderValue: count ? totalSales / count : 0,
    last7Sales,
    prior7Sales,
    ordersToShip,
    todaySales,
    todayCount,
    daily,
    paidCount,
    pendingCount,
    refundedCount,
  }
}

// ---- Best-effort extras (each degrades to null so one failure hides only its
// own section — never the whole page; same contract as getLowStock above). -----

export type TopSeller = { title: string; units: number; revenue: number; currency: string }

// Top products by units sold across recent orders, with the revenue each
// generated. Aggregates order line items in JS. read_orders scope (which you
// already have) covers this.
//
// Note the small first: counts: nesting lineItems inside orders MULTIPLIES the
// Shopify query cost (orders × lineItems), and a single Admin GraphQL query is
// capped at 1000 cost points. orders(40) × lineItems(15) ≈ 640 points stays
// safely under it; bumping these up will get the whole query rejected.
export async function getTopSellers(limit = 5): Promise<TopSeller[] | null> {
  try {
    const data = await shopifyGraphQL<{
      orders: { edges: { node: {
        lineItems: { edges: { node: {
          title: string
          quantity: number
          discountedTotalSet: { shopMoney: { amount: string; currencyCode: string } }
        } }[] }
      } }[] }
    }>(`
      query TopSellers {
        orders(first: 40, sortKey: CREATED_AT, reverse: true) {
          edges { node {
            lineItems(first: 15) { edges { node {
              title
              quantity
              discountedTotalSet { shopMoney { amount currencyCode } }
            } } }
          } }
        }
      }
    `)
    const tally = new Map<string, { units: number; revenue: number }>()
    let currency = 'MYR'
    for (const { node } of data.orders.edges) {
      for (const li of node.lineItems.edges) {
        const t = li.node
        currency = t.discountedTotalSet.shopMoney.currencyCode || currency
        const cur = tally.get(t.title) ?? { units: 0, revenue: 0 }
        cur.units += Number(t.quantity || 0)
        cur.revenue += Number(t.discountedTotalSet.shopMoney.amount || 0)
        tally.set(t.title, cur)
      }
    }
    return [...tally]
      .map(([title, v]) => ({ title, units: v.units, revenue: v.revenue, currency }))
      .filter(t => t.units > 0)
      .sort((a, b) => b.units - a.units)
      .slice(0, limit)
  } catch {
    return null
  }
}

export type AbandonedCart = { total: number; currency: string; createdAt: string; recoveryUrl: string | null }
export type AbandonedSummary = { count: number; recent: AbandonedCart[] }

// Abandoned checkouts (customer added contact info but didn't pay). Per Shopify's
// docs this needs only the read_orders scope, so it works with your current token.
// We read NO customer PII (just totals/dates/recovery link) to stay out of the
// "protected customer data" approval flow.
export async function getAbandonedCheckouts(): Promise<AbandonedSummary | null> {
  try {
    const data = await shopifyGraphQL<{
      abandonedCheckoutsCount: { count: number }
      abandonedCheckouts: { edges: { node: {
        createdAt: string
        recoveryUrl: string | null
        totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }
      } }[] }
    }>(`
      query Abandoned {
        abandonedCheckoutsCount { count }
        abandonedCheckouts(first: 5, sortKey: CREATED_AT, reverse: true) {
          edges { node {
            createdAt
            recoveryUrl
            totalPriceSet { shopMoney { amount currencyCode } }
          } }
        }
      }
    `)
    return {
      count: data.abandonedCheckoutsCount.count,
      recent: data.abandonedCheckouts.edges.map(({ node }) => ({
        total: Number(node.totalPriceSet.shopMoney.amount || 0),
        currency: node.totalPriceSet.shopMoney.currencyCode,
        createdAt: node.createdAt,
        recoveryUrl: node.recoveryUrl,
      })),
    }
  } catch {
    return null
  }
}

export type CustomerStats = { total: number; returning: number }

// New vs returning customers. Needs the read_customers scope (and, on newer API
// versions, protected-customer-data access). You don't have it yet, so this
// returns null and the page hides the section — add the scope to light it up.
export async function getReturningCustomers(): Promise<CustomerStats | null> {
  try {
    const data = await shopifyGraphQL<{
      customersCount: { count: number }
      customers: { edges: { node: { numberOfOrders: string } }[] }
    }>(`
      query ReturningCustomers {
        customersCount { count }
        customers(first: 250, sortKey: UPDATED_AT, reverse: true) {
          edges { node { numberOfOrders } }
        }
      }
    `)
    let returning = 0
    for (const { node } of data.customers.edges) {
      if (Number(node.numberOfOrders || 0) >= 2) returning++
    }
    return { total: data.customersCount.count, returning }
  } catch {
    return null
  }
}

export type LowStockItem = { title: string; qty: number }

// Variants at or below `threshold` units. Best-effort: if the store's API version
// rejects the inventory filter, we return null and the page hides the section
// rather than erroring.
export async function getLowStock(threshold = 5): Promise<LowStockItem[] | null> {
  try {
    const data = await shopifyGraphQL<{
      productVariants: { edges: { node: {
        title: string
        inventoryQuantity: number | null
        product: { title: string }
      } }[] }
    }>(`
      query LowStock {
        productVariants(first: 50, query: "inventory_quantity:<${threshold + 1}") {
          edges { node { title inventoryQuantity product { title } } }
        }
      }
    `)
    return data.productVariants.edges
      .map(({ node }) => ({
        title: node.product.title +
          (node.title && node.title !== 'Default Title' ? ` — ${node.title}` : ''),
        qty: node.inventoryQuantity ?? 0,
      }))
      .filter(v => v.qty <= threshold)
      .sort((a, b) => a.qty - b.qty)
  } catch {
    return null
  }
}
