'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

// Email + password sign-in. On success the @supabase/ssr browser client writes
// the session cookie, then router.refresh() re-runs the server layout (which now
// sees the session and renders the app shell) and we navigate to `next`.
export default function LoginForm({ next, configured }: { next: string; configured: boolean }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setBusy(false)
        return
      }
      // Land on the requested page (or dashboard), and refresh server components.
      router.replace(next)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <form className="login-form" onSubmit={onSubmit}>
      {!configured && (
        <p className="login-warn">
          Auth isn’t configured yet — add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your env, then redeploy.
        </p>
      )}
      <label className="login-label" htmlFor="email">Email</label>
      <input
        id="email"
        className="login-input"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@company.com"
      />
      <label className="login-label" htmlFor="password">Password</label>
      <input
        id="password"
        className="login-input"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="••••••••"
      />
      {error && <p className="login-error">{error}</p>}
      <button className="login-btn" type="submit" disabled={busy || !configured}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
