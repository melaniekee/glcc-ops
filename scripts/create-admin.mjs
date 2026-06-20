// One-time: create the ADMIN auth user and mark its profile as admin.
//
// IMPORTANT: this creates the account WITHOUT a password. You set your own
// password afterwards in the Supabase dashboard (Authentication → Users → your
// account → "..." → Reset/Send password / Set password). Your password is never
// passed here or seen by anyone but you.
//
// Run AFTER you've run supabase/auth.sql (so the profiles table exists):
//   npm run admin:create                 # uses the email baked in below
//   npm run admin:create you@company.com # or pass a different email
//
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (the same server-only
// service_role key the app already uses).

import { createClient } from '@supabase/supabase-js'

const DEFAULT_ADMIN_EMAIL = 'melaniekee@whattowear.com.my'
const ALL_TABS = ['dashboard', 'pipeline', 'money', 'tasks', 'projects', 'contacts', 'content', 'agents']

const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
const email = (process.argv[2] ?? DEFAULT_ADMIN_EMAIL).trim()

if (!url || !key) {
  console.error('✖ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env. Add them and retry.')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

// Find an existing auth user by email (admin.createUser errors if they exist).
async function findUserByEmail(targetEmail) {
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = data.users.find(u => (u.email ?? '').toLowerCase() === targetEmail.toLowerCase())
    if (found) return found
    if (data.users.length < 200) return null
    page++
  }
}

async function main() {
  console.log(`→ Setting up admin account for ${email} …`)

  let userId
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true, // confirmed, so you can log in as soon as you set a password
  })

  if (createErr) {
    // Most likely: already registered. Look them up and continue.
    const existing = await findUserByEmail(email)
    if (!existing) {
      console.error('✖ Could not create or find the user:', createErr.message)
      process.exit(1)
    }
    userId = existing.id
    console.log('• Account already existed — reusing it.')
  } else {
    userId = created.user.id
    console.log('• Created the auth account (no password set yet).')
  }

  // Mark the profile as admin (upsert in case the trigger already inserted it).
  const { error: profErr } = await supabase
    .from('profiles')
    .upsert({ id: userId, email, role: 'admin', allowed_tabs: ALL_TABS }, { onConflict: 'id' })

  if (profErr) {
    console.error('✖ Could not write the admin profile:', profErr.message)
    console.error('  Did you run supabase/auth.sql first (it creates the profiles table)?')
    process.exit(1)
  }

  console.log('✓ Admin profile set (role=admin, all tabs).')
  console.log('')
  console.log('NEXT — set YOUR password (I never see it):')
  console.log('  Supabase dashboard → Authentication → Users → ' + email)
  console.log('  → the "…" menu → "Reset password" (sends you a link) or "Set password".')
  console.log('Then sign in at /login.')
}

main().catch(err => {
  console.error('✖ Unexpected error:', err?.message ?? err)
  process.exit(1)
})
