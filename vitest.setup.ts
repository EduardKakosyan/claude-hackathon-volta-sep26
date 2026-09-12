import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Testing Library's automatic afterEach(cleanup) only self-registers when it
// detects a Jest-like global test framework. Vitest doesn't expose `afterEach`
// globally unless `test.globals` is set, so component tests would otherwise
// leak rendered trees across `it` blocks within the same file. Wiring it here
// once keeps every test file simple.
afterEach(() => {
  cleanup()
})
