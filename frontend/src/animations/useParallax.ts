import type { RefObject } from "react";

import { gsap, useGSAP } from "./gsap";
import { isCoarsePointer, prefersReducedMotion } from "./useReducedMotion";

/** Scrubbed vertical drift on a transform. Off for touch and reduced motion. */
export function useParallax(target: RefObject<HTMLElement | SVGElement | null>, distance = 80) {
  useGSAP(() => {
    if (prefersReducedMotion() || isCoarsePointer() || !target.current) return;
    gsap.to(target.current, {
      y: distance,
      ease: "none",
      scrollTrigger: { trigger: target.current, start: "top top", end: "bottom top", scrub: true },
    });
  });
}
