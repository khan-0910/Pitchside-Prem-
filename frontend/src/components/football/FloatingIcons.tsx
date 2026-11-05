import { useRef } from "react";

import { gsap, useGSAP } from "@/animations/gsap";
import { isCoarsePointer, prefersReducedMotion } from "@/animations/useReducedMotion";

import { Ball, GOODS } from "./icons";

interface Props {
  count?: number;
  /** Multiplier on opacity. Dashboards use less so numbers stay readable. */
  strength?: number;
  seed?: number;
  /** Follow the pointer as well as the scroll. */
  mouse?: boolean;
  className?: string;
}

const tint = ["text-flood", "text-volt", "text-flood", "text-gold", "text-flood"];

/** Kit drifting in the air. Each piece has its own depth, so scrolling separates them. */
export function FloatingIcons({ count = 10, strength = 1, seed = 1, mouse, className = "absolute inset-0" }: Props) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !root.current) return;
      const pieces = gsap.utils.toArray<HTMLElement>(".piece", root.current);
      pieces.forEach((piece) => {
        const depth = Number(piece.dataset.depth);
        gsap.to(piece, {
          yPercent: -120 * depth,
          rotation: 60 * depth,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: 1 },
        });
      });
      if (!mouse || isCoarsePointer()) return;
      const movers = pieces.map((piece) => ({
        x: gsap.quickTo(piece, "x", { duration: 0.9, ease: "power3" }),
        y: gsap.quickTo(piece, "y", { duration: 0.9, ease: "power3" }),
        depth: Number(piece.dataset.depth),
      }));
      const onMove = (e: PointerEvent) => {
        const dx = e.clientX / window.innerWidth - 0.5;
        const dy = e.clientY / window.innerHeight - 0.5;
        movers.forEach((m) => {
          m.x(-dx * 90 * m.depth);
          m.y(-dy * 60 * m.depth);
        });
      };
      window.addEventListener("pointermove", onMove, { passive: true });
      return () => window.removeEventListener("pointermove", onMove);
    },
    { scope: root },
  );

  const pieces = Array.from({ length: count }, (_, i) => {
    const n = i + seed * 7;
    const Icon = i % 3 === 0 ? Ball : GOODS[n % GOODS.length];
    const depth = 0.35 + ((n * 37) % 65) / 100;
    return {
      Icon,
      depth,
      left: (n * 41 + 7) % 96,
      top: (n * 29 + 11) % 92,
      size: Math.round(20 + depth * 44),
      opacity: Math.min((0.1 + depth * 0.3) * strength, 0.75),
      color: Icon === Ball ? "" : tint[n % tint.length],
      duration: 7 + (n % 7),
      delay: -(n % 9),
    };
  });

  return (
    <div ref={root} aria-hidden className={`pointer-events-none overflow-hidden ${className}`}>
      {pieces.map(({ Icon, depth, left, top, size, opacity, color, duration, delay }, i) => (
        <div key={i} className={`piece absolute ${i % 2 ? "max-sm:hidden" : ""}`} data-depth={depth} style={{ left: `${left}%`, top: `${top}%`, opacity }}>
          <div className="floaty" style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }}>
            <Icon size={size} className={color} />
          </div>
        </div>
      ))}
    </div>
  );
}
