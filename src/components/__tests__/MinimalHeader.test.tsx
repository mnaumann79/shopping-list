import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'

vi.mock('@/components/DarkModeToggle', () => ({
  DarkModeToggle: () => <div data-testid="dark-mode-toggle" />,
}))

import { MinimalHeader } from '../MinimalHeader'

describe('MinimalHeader', () => {
  it('renders DarkModeToggle', () => {
    render(<MinimalHeader />)
    expect(screen.getByTestId('dark-mode-toggle')).toBeInTheDocument()
  })

  it('does not render avatar or navigation', () => {
    render(<MinimalHeader />)
    expect(screen.queryByLabelText('Account menu')).toBeNull()
    expect(screen.queryByLabelText('Settings')).toBeNull()
  })

  it('renders header element', () => {
    render(<MinimalHeader />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })
})
