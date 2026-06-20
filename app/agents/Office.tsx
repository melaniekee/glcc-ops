'use client'
import { useState } from 'react'

// This is the ONLY 'use client' page. It must NEVER import lib/supabase or
// lib/records (those carry the service_role key) — it only ever calls the server
// through fetch('/api/jarvis-oyen').
//
// Add an agent? Add an entry here + a matching .w<N> keyframe in globals.css.
const AGENTS = [
  { key: 'oyen',      name: 'Jarvis Oyen', emoji: '🐱', tag: 'proactive', role: 'Chief of Staff. Reviews everything and pings you + your team on Telegram with what\'s overdue, blocked, and the top next steps.' },
  { key: 'jarvis',    name: 'Jarvis',      emoji: '💬', tag: 'live',       role: 'Q&A bot. Ask it anything about your data on Telegram — "how much is in pipeline?"' },
  { key: 'digest',    name: 'Digest',      emoji: '📅', tag: 'live',       role: 'Texts you a one-glance summary of your HQ every morning.' },
  { key: 'scribe',    name: 'Scribe',      emoji: '✍️', tag: 'live',       role: 'Your What To Wear copywriter. Drafts ready-to-post captions — pick a platform, add an optional theme, and get 3 on-brand options.' },
  { key: 'collector', name: 'Collector',   emoji: '💰', tag: 'soon',       role: 'Chases your overdue invoices automatically. (Day-2 skill-pack.)' },
  { key: 'scout',     name: 'Scout',       emoji: '🔎', tag: 'soon',       role: 'Researches new leads for your Pipeline. (Day-2 skill-pack.)' },
]

const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'whatsapp', 'xiaohongshu']

export default function Office() {
  const [sel, setSel] = useState('oyen')
  const [brief, setBrief] = useState('')
  const [loading, setLoading] = useState(false)
  const [topic, setTopic] = useState('')
  const [platform, setPlatform] = useState('instagram')

  const agent = AGENTS.find(a => a.key === sel)

  // Both live agents share this: hit their preview route, surface a friendly
  // setup message when the API key isn't wired yet (expected before deploy).
  async function call(path: string) {
    setLoading(true); setBrief('')
    try {
      const res = await fetch(path, { headers: { 'x-glcc-preview': '1' } })
      const data = await res.json().catch(() => ({}))
      if (data.ok && (data.briefing || data.content)) {
        setBrief((data.briefing || data.content).replace(/<\/?b>/g, '').replace(/<\/?i>/g, ''))
      } else if (data.reason === 'no_api_key') {
        setBrief('⚙️ Add your ANTHROPIC_API_KEY (the N step) — then this agent works here. This is expected before setup, not a bug.')
      } else if (data.reason === 'api_error') {
        setBrief('⚙️ Your ANTHROPIC_API_KEY errored — check it has credit, then try again.')
      } else {
        setBrief('Could not reach the agent yet. It lights up once you\'ve added your ANTHROPIC_API_KEY and deployed.')
      }
    } catch {
      setBrief('Could not reach the agent yet. It lights up once you\'ve added your ANTHROPIC_API_KEY and deployed.')
    } finally {
      setLoading(false)
    }
  }

  const runOyen = () => call('/api/jarvis-oyen?preview=1')
  const runScribe = () =>
    call(`/api/scribe?preview=1&platform=${platform}&topic=${encodeURIComponent(topic)}`)

  return (
    <>
      <div className="office" aria-label="AI agents office">
        {AGENTS.map((a, i) => (
          <button
            key={a.key}
            className={`agent w${i}${a.tag === 'soon' ? ' soon' : ''}${sel === a.key ? ' on' : ''}`}
            onClick={() => setSel(a.key)}
            title={a.name}
          >
            <span className="ava">{a.emoji}</span>
            <span className="nm">{a.name}</span>
          </button>
        ))}
        <span className="office-hint">hover to pause · click an agent</span>
      </div>

      {agent && (
        <div className="agent-card">
          <p className="ac-name">
            {agent.emoji} {agent.name}
            <span className={`tag ${agent.tag}`}>
              {agent.tag === 'soon' ? 'Day-2 skill-pack' : agent.tag}
            </span>
          </p>
          <p className="ac-role">{agent.role}</p>
          {agent.key === 'oyen' && (
            <>
              <button className="btn" onClick={runOyen} disabled={loading}>
                {loading ? 'Thinking…' : 'Run now (preview)'}
              </button>
              {brief && <pre className="brief">{brief}</pre>}
            </>
          )}
          {agent.key === 'scribe' && (
            <>
              <div className="scribe-controls">
                <select
                  className="sel"
                  value={platform}
                  onChange={e => setPlatform(e.target.value)}
                  aria-label="Platform"
                >
                  {PLATFORMS.map(p => (
                    <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
                <input
                  className="inp"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="Theme or product (optional) — e.g. Linen Atelier"
                  aria-label="Theme or product"
                />
              </div>
              <button className="btn" onClick={runScribe} disabled={loading}>
                {loading ? 'Drafting…' : 'Draft posts'}
              </button>
              {brief && <pre className="brief">{brief}</pre>}
            </>
          )}
        </div>
      )}
    </>
  )
}
