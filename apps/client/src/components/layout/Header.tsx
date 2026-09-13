import ThunesLogo from '@/assets/ThunesLogo.png'
import BuyFrameLogo from '@/assets/BF2026.png'
import { NotificationBell } from './NotificationBell'
import { UserMenu } from './UserMenu'

export function Header() {
  return (
    <header className="flex items-center justify-between border-b bg-background px-6 py-3">
      <div className="flex items-center gap-3">
        <img src={ThunesLogo} alt="Thunes" className="h-7 object-contain" />
        <span className="text-lg font-bold tracking-tight">STRIKE</span>
      </div>

      <div className="flex items-center gap-5">
        <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
          <span>Powered By</span>
          <img src={BuyFrameLogo} alt="BuyFRAME Logo" className="h-7 object-contain" />
        </div>
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  )
}
