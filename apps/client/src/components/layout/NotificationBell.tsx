import { Bell } from 'lucide-react'

/**
 * MOCK — a static badge count. There is no notifications backend yet
 * (FEATURES.md doesn't track one); wire this to a real unread-count query
 * when one exists, following the same hook pattern as the dashboard's
 * mock data (see features/dashboard/api/).
 */
const MOCK_UNREAD_COUNT = 1

export function NotificationBell() {
  return (
    <button
      type="button"
      aria-label="Notifications"
      className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Bell className="size-5" />
      {MOCK_UNREAD_COUNT > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-white">
          {MOCK_UNREAD_COUNT}
        </span>
      )}
    </button>
  )
}
