'use client'
import { useState } from 'react'
import Nav from './Nav'

// Layout shell. On desktop it renders the same static sidebar as before. On mobile
// (CSS-driven, see globals.css) the sidebar becomes a slide-in drawer toggled by the
// hamburger in the top bar, with a tap-to-close scrim. Layout only — no data/auth.
export default function AppShell({
  conn,
  children,
}: {
  conn: React.ReactNode
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
        <Nav onNavigate={close} />
        <p className="hint">One <code>records</code> table behind all 8 tabs.</p>
      </aside>

      <main className="main">{conn}{children}</main>
    </div>
  )
}
