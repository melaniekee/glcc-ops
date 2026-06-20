import './globals.css'
import AppShell from './_components/AppShell'
import ConnStatus from './_components/ConnStatus'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* ConnStatus is an async server component, so it's rendered here and passed
            into the client AppShell as a prop. */}
        <AppShell conn={<ConnStatus />}>{children}</AppShell>
      </body>
    </html>
  )
}
