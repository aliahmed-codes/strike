import { motion } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'

const tabs = [
  { label: 'Dashboard', path: '/' },
  { label: 'Pricing Requests', path: '/pricing-requests' },
  { label: 'Approvals', path: '/approvals' },
]

export function NavTabs() {
  const { pathname } = useLocation()

  return (
    <nav className="flex gap-6 border-b bg-background px-6">
      {tabs.map((tab) => {
        const isActive = pathname === tab.path
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={cn(
              'relative py-3 text-sm font-medium transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {isActive && (
              <motion.div
                layoutId="nav-tab-underline"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-primary"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
