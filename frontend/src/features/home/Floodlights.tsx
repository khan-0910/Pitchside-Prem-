import { useRef } from "react";

import { gsap, useGSAP } from "@/animations/gsap";
import { prefersReducedMotion } from "@/animations/useReducedMotion";

const TOWERS = [
  { side: "left", x: "22%" },
  { side: "left", x: "40%" },
  { side: "right", x: "60%" },
  { side: "right", x: "78%" },
] as const;

/**
 * The page opens on a pitch at night. The floodlight banks flicker on one after another, their
 * beams fall across the grass and the pitch comes up to full light. index.html paints the same
 * night colour first, so nothing flashes before this starts.
 */
export function Floodlights({ onLit }: { onLit?: () => void }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      if (prefersReducedMotion()) {
        gsap.set(q(".night"), { opacity: 0 });
        gsap.set(q(".beam"), { opacity: 0.16 });
        gsap.set(q(".bank"), { opacity: 1 });
        onLit?.();
        return;
      }
      const tl = gsap.timeline({ delay: 0.25, onComplete: onLit });
      q(".tower").forEach((tower, i) => {
        const at = i * 0.22;
        const bank = tower.querySelector(".bank");
        const beam = tower.querySelector(".beam");
        // A floodlight strikes, dips while the lamp warms, then settles.
        tl.to(bank, { keyframes: [{ opacity: 1, duration: 0.05 }, { opacity: 0.35, duration: 0.07 }, { opacity: 1, duration: 0.12 }] }, at)
          .to(beam, { keyframes: [{ opacity: 1, duration: 0.05 }, { opacity: 0.35, duration: 0.07 }, { opacity: 0.85, duration: 0.2 }] }, at);
      });
      tl.to(q(".night"), { opacity: 0, duration: 0.9, ease: "power2.out" }, 0.55)
        .to(q(".beam"), { opacity: 0.16, duration: 1.4, ease: "power1.out" }, 1.1);
    },
    { scope: root },
  );

  return (
    <div ref={root} aria-hidden className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      <div className="night absolute inset-0 bg-[#03100a]/85" />
      {TOWERS.map(({ side, x }) => (
        <div key={x} className="tower absolute top-0" style={{ left: x }}>
          <div
            className="beam absolute left-1/2 top-2 h-[120vh] w-[70vw] -translate-x-1/2 opacity-0 mix-blend-screen"
            style={{
              background: "conic-gradient(at 50% 0%, transparent 166deg, rgb(255 252 235 / 0.55) 172deg, rgb(255 253 240) 180deg, rgb(255 252 235 / 0.55) 188deg, transparent 194deg)",
              transform: `translateX(-50%) rotate(${side === "left" ? 24 : -24}deg)`,
              transformOrigin: "50% 0%",
              filter: "blur(10px)",
            }}
          />
          <div className="bank relative -ml-5 grid max-sm:hidden grid-cols-4 gap-[3px] rounded-[3px] bg-[#0f1512] p-[4px] opacity-0 shadow-[0_0_28px_8px_rgb(255_250_225_/_0.55)]">
            {Array.from({ length: 8 }, (_, i) => <span key={i} className="block size-[6px] rounded-full bg-[#fffbe6]" />)}
          </div>
        </div>
      ))}
    </div>
  );
}
