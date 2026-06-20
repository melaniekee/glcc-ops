'use client'
import { useState } from 'react'
import Nav from './Nav'
import type { Tab } from '@/lib/tabs'

// Layout shell. On desktop it renders the same static sidebar as before. On mobile
// (CSS-driven, see globals.css) the sidebar becomes a slide-in drawer toggled by the
// hamburger in the top bar, with a tap-to-close scrim. Layout only — no data logic.
// `tabs` is the already-filtered set the signed-in user may see; `email` labels the
// account footer with its sign-out button.
export default function AppShell({
  conn,
  tabs,
  email,
  children,
}: {
  conn: React.ReactNode
  tabs: Tab[]
  email: string | null
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <div className={`app${open ? ' nav-open' : ''}`}>
      {/* Mobile-only top bar (hidden on desktop via CSS). */}
      <header className="topbar">
        <button
          className="hamburger"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="app-sidebar"
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <span className="topbar-brand"><span className="logo" aria-hidden="true" /> Your AI HQ</span>
      </header>

      {/* Tap-outside-to-close scrim (mobile only). */}
      <div className={`scrim${open ? ' show' : ''}`} onClick={close} aria-hidden="true" />

      <aside id="app-sidebar" className={`side${open ? ' open' : ''}`}>
        <div className="brand"><span className="logo" aria-hidden="true" /> Your AI HQ</div>
        {/* Close the drawer after tapping a nav item. */}
        <Nav tabs={tabs} onNavigate={close} />
        {/* Account footer: who's signed in + sign out. Posts to the route handler
            that clears the session cookie and redirects to /login. */}
        <form className="account" action="/auth/signout" method="post">
          {email && <span className="account-email" title={email}>{email}</span>}
          <button className="signout" type="submit">Sign out</button>
        </form>
      </aside>

      <main className="main">{conn}{children}</main>
    </div>
  )
}
