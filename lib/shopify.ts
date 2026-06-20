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

// Format an amount in a given ISO currency (the store may not be in RM).
export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency }).format(amount || 0)
  } catch {
    return `${currency} ${Number(amount || 0).toLocaleString('en-MY')}`
  }
}
