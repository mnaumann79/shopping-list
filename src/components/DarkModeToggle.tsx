'use client'

import { useTheme } from '@/components/ThemeProvider'
import { useSyncExternalStore } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'

const CYCLE: Array<'system' | 'light' | 'dark'> = ['system', 'light', 'dark']
const subscribeToHydration = () => () => {}

export function DarkModeToggle() {
  const mounted = useSyncExternalStore(subscribeToHydration, () => true, () => false)
  const { theme, setTheme } = useTheme()

  if (!mounted) {
    return <div className="w-8 min-h-11" />
  }

  const current = (theme as 'system' | 'light' | 'dark') ?? 'system'
  const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]

  const Icon = current === 'dark' ? Moon : current === 'light' ? Sun : Monitor
  const tooltip =
    current === 'system'
      ? 'System (follows OS)'
      : current === 'light'
        ? 'Light mode'
        : 'Dark mode'

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      className="min-h-11 cursor-pointer"
      title={tooltip}
    >
      <Icon className="size-4" />
    </Button>
  )
}
