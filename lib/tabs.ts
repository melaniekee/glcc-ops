// Single source of truth for the app's tabs. Both the nav (UI) and the
// middleware (server-side gate) import this, so "what tabs exist" and "what URL
// maps to which tab" can never drift apart.
//
// `key` is the stable identifier stored in profiles.allowed_tabs (text[]).
// `href` is the route. Adding a tab? Add one line here + app/<name>/page.tsx.
export type Tab = { key: string; href: string; label: string }

export const TABS: Tab[] = [
  { key: 'dashboard', href: '/', label: 'Dashboard' },
  { key: 'pipeline', href: '/pipeline', label: 'Pipeline' },
  { key: 'money', href: '/money', label: 'Money' },
  { key: 'tasks', href: '/tasks', label: 'Tasks' },
  { key: 'projects', href: '/projects', label: 'Projects' },
  { key: 'contacts', href: '/contacts', label: 'Contacts' },
  { key: 'content', href: '/content', label: 'Content' },
  { key: 'shopify', href: '/shopify', label: 'Shopify' },
  { key: 'agents', href: '/agents', label: 'Agents' },
]

export const ALL_TAB_KEYS = TABS.map(t => t.key)

// Map a request pathname to the tab key it belongs to, or null if the path
// isn't a protected tab (e.g. /login, /auth/...). Longest-prefix match so
// /projects/123 still resolves to the 'projects' tab.
export function tabKeyForPath(pathname: string): string | null {
  // Exact home match first ('/' would prefix-match everything otherwise).
  if (pathname === '/') return 'dashboard'
  let best: Tab | null = null
  for (const t of TABS) {
    if (t.href === '/') continue
    if (pathname === t.href || pathname.startsWith(t.href + '/')) {
      if (!best || t.href.length > best.href.length) best = t
    }
  }
  return best?.key ?? null
}

// Given a profile, what tabs may they see? Admin = all tabs, always.
export function visibleTabs(role: string | null, allowedTabs: string[] | null): Tab[] {
  if (role === 'admin') return TABS
  const allowed = new Set(allowedTabs ?? [])
  return TABS.filter(t => allowed.has(t.key))
}
