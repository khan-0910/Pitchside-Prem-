import { useRef } from "react";

import { gsap, useGSAP } from "@/animations/gsap";
import { prefersReducedMotion } from "@/animations/useReducedMotion";

const MARKS = {
  circle: "M300 40a160 160 0 1 1 0 320a160 160 0 1 1 0-320M300 0V400M300 196v8",
  box: "M0 60H240V340H0M0 130H90V270H0M240 150A95 95 0 0 1 240 250",
  corner: "M0 330A70 70 0 0 0 70 400M0 0V400H600",
  arc: "M60 400A240 240 0 0 1 540 400M0 400H600",
};

/** Chalk lines that paint themselves as the section scrolls in. */
export function PitchMark({ mark, className = "" }: { mark: keyof typeof MARKS; className?: string }) {
  const root = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      const path = root.current?.querySelector("path");
      if (!path || !path.getTotalLength || prefersReducedMotion()) return;
      const length = path.getTotalLength();
      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
      gsap.to(path, {
        strokeDashoffset: 0,
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top 95%", end: "top 25%", scrub: 0.8 },
      });
    },
    { scope: root },
  );

  return (
    <svg ref={root} aria-hidden viewBox="0 0 600 400" className={`pointer-events-none absolute ${className}`} fill="none">
      <path d={MARKS[mark]} stroke="#F3F5EF" strokeOpacity="0.16" strokeWidth="2.5" />
    </svg>
  );
}
