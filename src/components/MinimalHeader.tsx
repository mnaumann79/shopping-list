'use client'

import { DarkModeToggle } from '@/components/DarkModeToggle'

export function MinimalHeader() {
  return (
    <header className="border-b border-border bg-background px-4 flex items-center justify-end min-h-[52px]">
      <DarkModeToggle />
    </header>
  )
}
