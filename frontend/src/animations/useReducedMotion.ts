import { useSyncExternalStore } from "react";

import { useUi } from "@/stores/ui";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia?.(QUERY);
  media?.addEventListener("change", onChange);
  const stopStore = useUi.subscribe(onChange);
  return () => {
    media?.removeEventListener("change", onChange);
    stopStore();
  };
}

export function prefersReducedMotion(): boolean {
  return useUi.getState().reduceMotion || (window.matchMedia?.(QUERY).matches ?? false);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

export function isCoarsePointer(): boolean {
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}
