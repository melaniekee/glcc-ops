import crypto from 'crypto'
import { shopifyOAuth, shopifyOAuthConfigured } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// Step 1 of the one-time OAuth handshake that mints a long-lived (offline) Admin
// API access token for your own store.
//
//   You visit  /api/shopify/install
//   → we bounce you to Shopify to approve the read_products/read_orders scopes
//   → Shopify sends you back to /api/shopify/callback with a code
//   → the callback swaps the code for the token and shows it to you to paste into
//     SHOPIFY_ADMIN_API_TOKEN.
//
// The `state` nonce (stored in an httpOnly cookie and checked in the callback)
// protects against CSRF on the OAuth flow.
export async function GET(req: Request) {
  if (!shopifyOAuthConfigured) {
    return new Response(
      'Shopify OAuth not configured. Set SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and ' +
      'SHOPIFY_CLIENT_SECRET in .env, then restart the dev server.',
      { status: 400 },
    )
  }

  const { domain, clientId, scopes } = shopifyOAuth
  const origin = (process.env.SHOPIFY_APP_URL?.trim() || new URL(req.url).origin).replace(/\/+$/, '')
  const redirectUri = `${origin}/api/shopify/callback`
  const state = crypto.randomBytes(16).toString('hex')

  const authUrl =
    `https://${domain}/admin/oauth/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&grant_options[]=`   // empty grant_options[] = offline (long-lived) token

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      // httpOnly so JS can't read it; SameSite=Lax so it survives the redirect back.
      'Set-Cookie': `shopify_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    },
  })
}
