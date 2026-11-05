import type { RefObject } from "react";

import { ScrollTrigger, useGSAP } from "./gsap";
import { prefersReducedMotion } from "./useReducedMotion";

/** Fires once when the element reaches the viewport, then stays out of the way. */
export function useReveal(scope: RefObject<HTMLElement | null>, onReveal: () => void) {
  useGSAP(
    () => {
      if (prefersReducedMotion() || !scope.current) return;
      ScrollTrigger.create({ trigger: scope.current, start: "top 75%", once: true, onEnter: () => onReveal() });
    },
    { scope },
  );
}
