'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Tab } from '@/lib/tabs'

// Tabs are defined once in lib/tabs.ts and FILTERED on the server (in the root
// layout, by the user's role + allowed_tabs) before being passed here. So this
// only ever renders links the user is allowed to see. NOTE: hiding a link is not
// the security boundary — middleware.ts blocks the URLs server-side too.
export default function Nav({ tabs, onNavigate }: { tabs: Tab[]; onNavigate?: () => void }) {
  const path = usePathname()
  return (
    <nav className="nav">
      {tabs.map(t => (
        <Link key={t.href} href={t.href} className={path === t.href ? 'active' : ''} onClick={onNavigate}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
