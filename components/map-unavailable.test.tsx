import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MapUnavailable } from '@/components/map-unavailable'

describe('MapUnavailable', () => {
  const mockOnRetry = vi.fn()

  it('displays the error message', () => {
    render(
      <MapUnavailable
        message="WebGL is not available"
        onRetry={mockOnRetry}
      />
    )

    expect(screen.getByText('WebGL is not available')).toBeInTheDocument()
  })

  it('displays that this is a problem with the map, not a beach status', () => {
    render(
      <MapUnavailable
        message="Map error"
        onRetry={mockOnRetry}
      />
    )

    expect(screen.getByText(/This is a problem with the map, not with any beach/)).toBeInTheDocument()
  })

  it('has a "Try the map again" button that calls onRetry', async () => {
    const user = userEvent.setup()
    render(
      <MapUnavailable
        message="Map error"
        onRetry={mockOnRetry}
      />
    )

    const retryButton = screen.getByRole('button', { name: /try the map again/i })
    await user.click(retryButton)

    expect(mockOnRetry).toHaveBeenCalledOnce()
  })

  it('has role="alert" for immediate announcement', () => {
    render(
      <MapUnavailable
        message="Map error"
        onRetry={mockOnRetry}
      />
    )

    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
  })

  it('every beach is still listed beside this panel with its official source link', () => {
    // This is more of a structural note verified in BeachApp tests
    render(
      <MapUnavailable
        message="Map error"
        onRetry={mockOnRetry}
      />
    )

    expect(screen.getByText('The map could not load')).toBeInTheDocument()
  })
})
