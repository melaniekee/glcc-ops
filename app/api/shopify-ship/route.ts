import { sendMessage } from '@/lib/telegram'
import { getSalesSummary, getLowStock, money } from '@/lib/shopify'

export const dynamic = 'force-dynamic'

// A Vercel Cron hits this once a day and texts the owner the "ship today" queue:
// paid-but-unfulfilled orders (oldest first) plus any low-stock items to restock.
// Reuses the same Shopify connection as the /shopify tab (lib/shopify.ts), so it
// needs no extra env beyond what that tab already uses.
//
// Auth model is identical to /api/digest and /api/shopify-brief: if CRON_SECRET is
// set, Vercel Cron sends it as a Bearer token and this route rejects anyone else.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('forbidden', { status: 401 })
  }

  const owner = process.env.OWNER_CHAT_ID?.trim()
  if (!owner) return Response.json({ ok: false, reason: 'no OWNER_CHAT_ID' })

  try {
    const sales = await getSalesSummary()
    const ship = sales.ordersToShip
    const lowStock = (await getLowStock(5)) ?? []

    const today = new Date().toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur',
    })

    const shipSection = ship.length
      ? `📦 <b>Ship today</b> (${ship.length} paid &amp; unfulfilled):\n` +
        ship.slice(0, 10).map(o => `• ${o.name} — ${money(o.amount, o.currency)}`).join('\n')
      : `✅ Nothing to ship — all paid orders are fulfilled.`

    const stockSection = lowStock.length
      ? `\n\n🔻 <b>Low stock (≤ 5):</b>\n` +
        lowStock.slice(0, 10).map(p => `• ${p.title} — ${p.qty} left`).join('\n')
      : ''

    const msg = `🚚 <b>Shopify — orders to ship</b> — ${today}\n\n` + shipSection + stockSection

    await sendMessage(owner, msg)
    return Response.json({ ok: true, sent: true, toShip: ship.length, lowStock: lowStock.length })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    await sendMessage(owner, `⚠️ Shopify ship reminder failed: ${message}`)
    return Response.json({ ok: false, error: message })
  }
}
