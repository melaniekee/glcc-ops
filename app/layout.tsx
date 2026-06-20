import './globals.css'
import AppShell from './_components/AppShell'
import ConnStatus from './_components/ConnStatus'
import { getProfile } from '@/lib/auth'
import { visibleTabs } from '@/lib/tabs'

export const metadata = {
  title: 'Your AI HQ',
  description: 'GLCC Starter — your business in one place',
}

// Explicit viewport so phones render at device width (and don't auto-zoom on focus);
// viewportFit:'cover' lets us use safe-area insets under the notch / home bar.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Who's signed in? Drives BOTH chrome (show the sidebar only when logged in, so
  // /login renders bare) AND which tabs the nav shows. The middleware enforces the
  // same rules server-side, so this is presentation, not the security boundary.
  const profile = await getProfile()
  const tabs = profile ? visibleTabs(profile.role, profile.allowedTabs) : []

  return (
    <html lang="en">
      <body>
        {profile ? (
          // ConnStatus is an async server component, so it's rendered here and
          // passed into the client AppShell as a prop.
          <AppShell conn={<ConnStatus />} tabs={tabs} email={profile.email}>
            {children}
          </AppShell>
        ) : (
          // Logged out (e.g. the /login page) — no sidebar, just the page.
          children
        )}
      </body>
    </html>
  )
}
