import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { TABS, tabKeyForPath } from '@/lib/tabs'

// Server-side gate (Next 16 "proxy" convention — formerly middleware). Runs
// before any protected page renders, so it — not the hidden nav link — is the
// real access control. Two jobs:
//   1. No valid session  → redirect to /login (with ?next= so we can come back).
//   2. Logged in but the URL maps to a tab they're not allowed → bounce them to
//      their first allowed tab (admins bypass entirely).
// The matcher below excludes /login, /auth, /api and static assets, so this
// never runs on the login page itself (no redirect loop).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Before the browser-safe Supabase keys are pasted in, don't gate anything —
  // the app stays open (and ConnStatus/login show the "add your keys" notice)
  // instead of redirect-looping with a half-built client.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return response
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: getUser() revalidates the token against Supabase — do not trust
  // getSession() alone for auth decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // 1) Not logged in → send to /login, remembering where they were headed.
  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 2) Per-tab authorization for tab URLs.
  const key = tabKeyForPath(pathname)
  if (key) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, allowed_tabs')
      .eq('id', user.id)
      .single()

    const role = profile?.role
    const allowed: string[] = profile?.allowed_tabs ?? []

    if (role !== 'admin' && !allowed.includes(key)) {
      // Land them on their first allowed tab; if they have none, send to login.
      const firstAllowed = TABS.find(t => allowed.includes(t.key))
      const dest = request.nextUrl.clone()
      dest.search = ''
      dest.pathname = firstAllowed ? firstAllowed.href : '/login'
      return NextResponse.redirect(dest)
    }
  }

  return response
}

export const config = {
  // Run on everything EXCEPT Next internals, static files, and the auth surfaces
  // (/login, /auth/*, /api/*) which must stay reachable while logged out.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|auth|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)',
  ],
}
