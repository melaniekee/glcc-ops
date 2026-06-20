import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/auth'

// POST /auth/signout — clears the Supabase session cookie, then redirects to
// /login. Used by the "Sign out" button in the sidebar.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
