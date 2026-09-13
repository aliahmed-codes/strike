import { useState, type MouseEvent } from 'react'
import { X } from 'lucide-react'
import { motion } from 'framer-motion'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useQuoteWorkspaceStore } from '@/features/quotes/store/useQuoteWorkspaceStore'
import { cn } from '@/lib/utils'

const fixedTabs = [
  { label: 'Dashboard', path: '/' },
  { label: 'Pricing Requests', path: '/pricing-requests' },
  { label: 'Approvals', path: '/approvals' },
]

export function NavTabs() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const quoteTabs = useQuoteWorkspaceStore((state) => state.tabs)
  const closeTab = useQuoteWorkspaceStore((state) => state.closeTab)
  const isDirty = useQuoteWorkspaceStore((state) => state.isDirty)
  const [pendingCloseKey, setPendingCloseKey] = useState<string | null>(null)

  function performClose(key: string) {
    const isActive = pathname === `/quotes/${key}`
    closeTab(key)
    if (isActive) {
      const remaining = useQuoteWorkspaceStore.getState().tabs
      navigate(remaining.length > 0 ? `/quotes/${remaining[remaining.length - 1].key}` : '/')
    }
  }

  function handleClose(e: MouseEvent, key: string) {
    e.preventDefault()
    e.stopPropagation()
    if (isDirty(key)) {
      setPendingCloseKey(key)
    } else {
      performClose(key)
    }
  }

  return (
    <nav className="flex gap-6 overflow-x-auto border-b bg-background px-6">
      {fixedTabs.map((tab) => {
        const isActive = pathname === tab.path
        return (
          <Link
            key={tab.path}
            to={tab.path}
            className={cn(
              'relative py-3 text-sm font-medium whitespace-nowrap transition-colors',
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

      {quoteTabs.map((tab) => {
        const path = `/quotes/${tab.key}`
        const isActive = pathname === path
        return (
          <Link
            key={tab.key}
            to={path}
            className={cn(
              'relative flex items-center gap-2 py-3 text-sm font-medium whitespace-nowrap transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            <button
              type="button"
              onClick={(e) => handleClose(e, tab.key)}
              className="rounded-full p-0.5 hover:bg-muted"
              aria-label={`Close ${tab.label}`}
            >
              <X className="size-3.5" />
            </button>
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

      <AlertDialog open={pendingCloseKey !== null} onOpenChange={(open) => !open && setPendingCloseKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this tab?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on this pricing request. Closing the tab will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingCloseKey) performClose(pendingCloseKey)
                setPendingCloseKey(null)
              }}
            >
              Discard and close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  )
}
