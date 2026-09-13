import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// jsdom non implementa ResizeObserver (usato da Recharts).
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
