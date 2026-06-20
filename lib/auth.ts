import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { tabKeyForPath } from './tabs'

// Auth is "configured" only once BOTH browser-safe vars are present. Before the
// user pastes them, the app degrades to logged-out instead of crashing — same
// graceful-degradation pattern as lib/supabase.ts.
export const authConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

// Server-side Supabase auth client (cookie-backed). Safe to use from Server
// Components, Route Handlers, and Server Actions. Uses the PUBLISHABLE/ANON key
// and reads the logged-in user from the session cookie — it is bound by RLS, so
// a user can only ever read their own profile row. The service_role client in
// lib/supabase.ts is separate and untouched.
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // The middleware refreshes the session cookie, so this is safe to ignore.
          }
        },
      },
    },
  )
}

export type Profile = {
  userId: string
  email: string | null
  role: 'admin' | 'member'
  allowedTabs: string[]
}

// The logged-in user's profile (role + allowed tabs), or null if signed out.
// Verified server-side via getUser() — never trust the client.
export async function getProfile(): Promise<Profile | null> {
  if (!authConfigured) return null
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('role, allowed_tabs, email')
    .eq('id', user.id)
    .single()

  return {
    userId: user.id,
    email: data?.email ?? user.email ?? null,
    role: (data?.role as 'admin' | 'member') ?? 'member',
    allowedTabs: data?.allowed_tabs ?? [],
  }
}

// Can this profile open this pathname? Admin → always. Non-tab paths (login,
// auth) → true (the middleware handles those separately). A tab path → only if
// the tab key is in allowed_tabs.
export function canAccess(profile: Profile, pathname: string): boolean {
  if (profile.role === 'admin') return true
  const key = tabKeyForPath(pathname)
  if (!key) return true
  return profile.allowedTabs.includes(key)
}
