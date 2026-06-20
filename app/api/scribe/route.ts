import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

// Scribe ✍️ — the marketing copywriter agent for What To Wear (whattowear.com.my).
//   • Office "Draft posts" button → GET ?preview=1  (generates captions, NEVER sends)
//   • Anything else               → a no-secret status check (no generation)
// Same soft guard as Jarvis Oyen: require the x-glcc-preview header the office
// sends, so a random crawler can't loop this and burn your Anthropic credit.

// Everything Scribe knows about the brand. Edit this block to retune its voice —
// it's the single source of truth for who What To Wear is.
const BRAND = `BRAND: What To Wear (whattowear.com.my) — "Your Go-To Fashion Brand".
A Malaysian contemporary women's fashion label. Categories: dresses, tops, jeans,
knitwear, skirts, and coordinate sets — from easy weekend wear to polished office looks.
Current lines to reference where relevant: BLOOM '26 Spring, KLFW Resort 25,
Linen Atelier, Denimfication, and the "Value Buy" sale (up to 70% off).
Perks: free shipping on orders over RM199. Prices are in RM (Malaysian Ringgit).
Sells on Instagram, Facebook, Telegram, WhatsApp, Xiaohongshu and YouTube.
AUDIENCE: style-conscious young women in Malaysia & Southeast Asia.
VOICE: modern, minimalist, warm and accessible — trend-aware without being loud.
Tasteful emojis only. Clean lines. Never spammy or all-caps. Light Malaysian warmth is fine.`

// Per-platform shaping so a caption fits where it'll actually be posted.
const PLATFORM: Record<string, string> = {
  instagram: 'Instagram: a scroll-stopping first line, 2–4 short lines of body, a clear CTA (link in bio / shop now), then 8–12 relevant hashtags on their own line.',
  facebook:  'Facebook: a friendly hook, 2–3 sentences, a clear CTA with the website. Few or no hashtags.',
  tiktok:    'TikTok: a punchy on-screen hook line, a short caption, and 4–6 trend-style hashtags.',
  whatsapp:  'WhatsApp broadcast: short, personal, one clear offer and CTA. No hashtags. A couple of tasteful emojis.',
  xiaohongshu: 'Xiaohongshu (RED): an aspirational, lifestyle-led title + caption, styling tip included, 5–8 hashtags.',
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const preview = url.searchParams.get('preview') === '1'

  if (preview) {
    if (req.headers.get('x-glcc-preview') !== '1') return new Response('forbidden', { status: 403 })
    if (!process.env.ANTHROPIC_API_KEY) return Response.json({ ok: false, reason: 'no_api_key' })
    const topic = (url.searchParams.get('topic') || '').slice(0, 200)
    const platform = (url.searchParams.get('platform') || 'instagram').toLowerCase()
    const content = await draft(topic, platform)
    return content ? Response.json({ ok: true, content }) : Response.json({ ok: false, reason: 'api_error' })
  }

  return Response.json({
    ok: true,
    anthropicKeySet: !!process.env.ANTHROPIC_API_KEY,
    note: 'Drafting is preview-only. Use ?preview=1 from the app to generate captions.',
  })
}

async function draft(topic: string, platform: string): Promise<string | null> {
  const shape = PLATFORM[platform] ?? PLATFORM.instagram
  const focus = topic.trim()
    ? `The owner wants posts about: "${topic.trim()}". Treat this as the theme/product to feature.`
    : `No specific theme was given — pick a strong, on-season angle (e.g. a featured collection or the Value Buy sale) and run with it.`

  const system =
    `You are Scribe, the in-house social copywriter for the brand below. ` +
    `Write 3 distinct, ready-to-post caption options — each one copy-paste ready, no placeholders. ` +
    `Number them 1, 2, 3 and keep them clearly separated. ${shape} ${focus} ` +
    `Stay 100% on brand voice. Do not invent prices or discounts beyond what's stated; if you mention an offer, keep it to the free-shipping-over-RM199 perk or the named Value Buy sale.\n` +
    `<<<BRAND\n${BRAND}\nBRAND>>>`

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim() })
    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 900,
      system,
      messages: [{ role: 'user', content: `Draft today's ${platform} posts.` }],
    })
    return res.content.find(c => c.type === 'text')?.text ?? null
  } catch (e) {
    console.error('[GLCC] Scribe error:', e)
    return null
  }
}
