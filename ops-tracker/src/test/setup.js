import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver (used by charts).
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};
