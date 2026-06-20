'use client'
import { createBrowserClient } from '@supabase/ssr'

// Browser-side Supabase client used ONLY for auth (the /login form).
// It uses the PUBLISHABLE / ANON key, which is safe to expose to the browser —
// it can do nothing past row-level security on its own. The service_role key in
// lib/supabase.ts stays server-only and is never imported here.
//
// Session is persisted in cookies (by @supabase/ssr) so the server — middleware,
// layout — can read who's logged in. That cookie sharing is the whole point of
// using @supabase/ssr instead of the plain supabase-js browser client.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
