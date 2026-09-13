import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { NavTabs } from './NavTabs'

export function AppShell() {
  return (
    <div className="min-h-svh bg-muted/30">
      <Header />
      <NavTabs />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
