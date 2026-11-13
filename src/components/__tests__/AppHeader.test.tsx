import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockPush = vi.fn()
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

vi.mock('@/lib/auth-client', () => ({
  signOut: vi.fn().mockResolvedValue({ error: null }),
}))

// The switcher is a separate component with its own data fetching; stub it
// so this test stays about the header.
vi.mock('@/components/household-switcher', () => ({
  HouseholdSwitcher: () => <div data-testid="household-switcher" />,
}));

vi.mock('@/components/DarkModeToggle', () => ({
  DarkModeToggle: () => <div data-testid="dark-mode-toggle" />,
}))

// The dropdown menu is a thin wrapper around Base UI. Stubbing it keeps this
// test about AppHeader's own behaviour - what the Log out item does - and
// leaves the real menu to the end-to-end specs.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <button {...props}>{children}</button>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { AppHeader } from '../AppHeader'
import { signOut } from '@/lib/auth-client'

describe('AppHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders app title in default variant', () => {
    render(<AppHeader userName="John Doe" />)
    expect(screen.getByText('Shopping List')).toBeInTheDocument()
  })

  it('renders avatar with initials in default variant', () => {
    render(<AppHeader userName="John Doe" />)
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('renders settings icon link in default variant', () => {
    render(<AppHeader userName="John Doe" />)
    const settingsLink = screen.getByLabelText('Settings')
    expect(settingsLink).toBeInTheDocument()
    expect(settingsLink.closest('a')?.getAttribute('href')).toBe('/household/settings')
  })

  it('renders DarkModeToggle in default variant', () => {
    render(<AppHeader userName="John Doe" />)
    expect(screen.getByTestId('dark-mode-toggle')).toBeInTheDocument()
  })

  it('renders back arrow and Settings label in settings variant', () => {
    render(<AppHeader userName="John Doe" variant="settings" />)
    expect(screen.getByLabelText('Back to dashboard')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    const backLink = screen.getByLabelText('Back to dashboard')
    expect(backLink.closest('a')?.getAttribute('href')).toBe('/dashboard')
  })

  it('does not render settings icon in settings variant', () => {
    render(<AppHeader userName="John Doe" variant="settings" />)
    // No link to /household/settings should exist
    const links = screen.queryAllByRole('link')
    const settingsLink = links.find((l) => l.getAttribute('href') === '/household/settings')
    expect(settingsLink).toBeUndefined()
  })

  it('logout dropdown calls signOut and navigates', async () => {
    await act(async () => {
      render(<AppHeader userName="John Doe" />)
    })

    // Open the account menu and pick Log out.
    fireEvent.click(screen.getByLabelText('Account menu'))
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled()
    })
    expect(mockPush).toHaveBeenCalledWith('/sign-in')
    expect(mockRefresh).toHaveBeenCalled()
  })
})
