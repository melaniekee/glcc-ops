import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

// Standalone login screen. The root layout renders the app shell only when a
// user is logged in, so this page shows on its own (no sidebar). If someone who
// is already signed in lands here, bounce them straight to the dashboard.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const profile = await getProfile()
  if (profile) redirect('/')

  const { next } = await searchParams
  const safeNext = next && next.startsWith('/') ? next : '/'
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand"><span className="logo" aria-hidden="true" /> Your AI HQ</div>
        <h1 className="login-title">Sign in</h1>
        <p className="login-sub">Welcome back — sign in to your team workspace.</p>
        <LoginForm next={safeNext} configured={configured} />
      </div>
    </div>
  )
}
