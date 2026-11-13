import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Testing Library only auto-cleans when the runner exposes a global
// afterEach; Vitest runs without globals here, so unmount after each test.
afterEach(() => {
  cleanup();
});
