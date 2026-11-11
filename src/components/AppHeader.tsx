'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Suspense, lazy, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { Settings, ArrowLeft, History } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DarkModeToggle } from '@/components/DarkModeToggle'

const AccountMenu = lazy(() =>
  import('@/components/ui/dropdown-menu').then((m) => ({
    default: function AccountMenuInner(props: {
      open: boolean
      onOpenChange: (open: boolean) => void
      onLogout: () => void
      children: React.ReactNode
    }) {
      return (
        <m.DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
          <m.DropdownMenuTrigger
            className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            aria-label="Account menu"
          >
            {props.children}
          </m.DropdownMenuTrigger>
          <m.DropdownMenuContent align="end">
            <m.DropdownMenuItem onClick={props.onLogout}>
              Log out
            </m.DropdownMenuItem>
          </m.DropdownMenuContent>
        </m.DropdownMenu>
      )
    },
  }))
)

interface AppHeaderProps {
  userName: string
  variant?: 'default' | 'settings'
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export function AppHeader({ userName, variant = 'default' }: AppHeaderProps) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await authClient.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  return (
    <header className="border-b border-border bg-background px-4 flex items-center justify-between min-h-13">
      {/* Left zone */}
      {variant === 'default' ? (
        <span className="text-base font-semibold">Shopping List</span>
      ) : (
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            aria-label="Back to dashboard"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'min-h-11')}
          >
            <ArrowLeft className="size-5" />
          </Link>
          <span className="text-base font-semibold">Settings</span>
        </div>
      )}

      {/* Right zone */}
      <div className="flex items-center gap-2">
        {/* Avatar dropdown — lazy-loaded */}
        <Suspense fallback={
          <button
            className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
            aria-label="Account menu"
            disabled
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs font-semibold">
                {getInitials(userName)}
              </AvatarFallback>
            </Avatar>
          </button>
        }>
          <AccountMenu open={menuOpen} onOpenChange={setMenuOpen} onLogout={handleLogout}>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs font-semibold">
                {getInitials(userName)}
              </AvatarFallback>
            </Avatar>
          </AccountMenu>
        </Suspense>

        {/* Settings icon (default variant only) */}
        {variant === 'default' && (
          <Link
            href="/history"
            aria-label="Item history"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'min-h-11')}
          >
            <History className="size-5" />
          </Link>
        )}

        {variant === 'default' && (
          <Link
            href="/household/settings"
            aria-label="Settings"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'min-h-11')}
          >
            <Settings className="size-5" />
          </Link>
        )}

        <DarkModeToggle />
      </div>
    </header>
  )
}
