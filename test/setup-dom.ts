import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Stub matchMedia for tests; controllable for prefers-reduced-motion
let prefersReducedMotion = false

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: query === 'prefers-reduced-motion: reduce' && prefersReducedMotion,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Expose setReducedMotion for tests
Object.defineProperty(window, '__setReducedMotion', {
  writable: true,
  value: (value: boolean) => {
    prefersReducedMotion = value
  },
})

// Stub scrollTo and scrollIntoView
Element.prototype.scrollIntoView = vi.fn()
Element.prototype.scrollTo = vi.fn()
Window.prototype.scrollTo = vi.fn()

// Stub ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))
