import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = Observer as unknown as typeof ResizeObserver;
window.innerWidth = 800; // the phone layout has no SVG path maths, which jsdom lacks
globalThis.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;

export function setReducedMotion(value: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce") ? value : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
setReducedMotion(false);
