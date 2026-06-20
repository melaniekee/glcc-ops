import crypto from 'crypto'
import { shopifyOAuth, shopifyOAuthConfigured } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// Step 2 of the OAuth handshake (see /api/shopify/install). Shopify redirects the
// browser here with ?code&hmac&shop&state. We verify it's genuinely from Shopify
// (HMAC) and matches the flow we started (state), then swap the code for a
// long-lived offline access token and show it so you can paste it into
// SHOPIFY_ADMIN_API_TOKEN. We never log the token.
export async function GET(req: Request) {
  if (!shopifyOAuthConfigured) {
    return html('Not configured', 'Set SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET first.', 400)
  }

  const url = new URL(req.url)
  const params = Object.fromEntries(url.searchParams.entries())
  const { code, hmac, shop, state } = params

  if (!code || !hmac || !shop || !state) {
    return html('Missing parameters', 'The callback URL is missing expected OAuth parameters.', 400)
  }

  // 1) CSRF: the state must match the nonce we set when starting the flow.
  const cookieState = readCookie(req, 'shopify_oauth_state')
  if (!cookieState || !safeEqual(cookieState, state)) {
    return html('State mismatch', 'The OAuth state did not match. Start again at /api/shopify/install.', 403)
  }

  // 2) The shop must be the store we expect, and a real myshopify domain.
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop) ||
      shop.toLowerCase() !== shopifyOAuth.domain.toLowerCase()) {
    return html('Unexpected shop', `Refusing to continue for "${escapeHtml(shop)}".`, 403)
  }

  // 3) Authenticity: recompute the HMAC over all params except `hmac`/`signature`.
  const message = Object.keys(params)
    .filter(k => k !== 'hmac' && k !== 'signature')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&')
  const digest = crypto.createHmac('sha256', shopifyOAuth.clientSecret).update(message).digest('hex')
  if (!safeEqual(digest, hmac)) {
    return html('HMAC verification failed', 'The request signature was invalid — it may not be from Shopify.', 403)
  }

  // 4) Exchange the authorization code for an offline access token.
  let token = ''
  let scope = ''
  try {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: shopifyOAuth.clientId,
        client_secret: shopifyOAuth.clientSecret,
        code,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return html('Token exchange failed', `Shopify returned HTTP ${res.status}. Check your Client secret.`, 502)
    }
    const data = await res.json()
    token = data.access_token ?? ''
    scope = data.scope ?? ''
  } catch (e) {
    return html('Token exchange error', escapeHtml((e as Error).message), 502)
  }

  if (!token) {
    return html('No token returned', 'Shopify did not return an access token.', 502)
  }

  // 5) Show the token once, with paste instructions. Clear the state cookie.
  const body = `
    <p style="color:#15803d;font-weight:600">✅ Token minted for ${escapeHtml(shop)}</p>
    <p>Scopes granted: <code>${escapeHtml(scope)}</code></p>
    <p>Add this line to your <code>.env</code> (and on Vercel, to Environment Variables), then restart / redeploy:</p>
    <pre style="white-space:pre-wrap;word-break:break-all;background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px">SHOPIFY_ADMIN_API_TOKEN=${escapeHtml(token)}</pre>
    <p style="color:#b45309">⚠️ Treat this like a password. It grants read access to your products &amp; orders. This page shows it only once — copy it now.</p>
    <p>Then open <a href="/shopify">the Shopify tab</a> to see your live store data.</p>`

  return new Response(page('Shopify connected', body), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': 'shopify_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    },
  })
}

// --- small helpers ----------------------------------------------------------

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie') ?? ''
  const hit = raw.split(/;\s*/).find(c => c.startsWith(name + '='))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function page(title: string, inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="font-family:system-ui,sans-serif;max-width:680px;margin:40px auto;padding:0 16px;line-height:1.5">
  <h1 style="font-size:1.3rem">${title}</h1>${inner}</body></html>`
}

function html(title: string, msg: string, status: number): Response {
  return new Response(page(title, `<p>${escapeHtml(msg)}</p><p><a href="/api/shopify/install">Try again</a></p>`), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
