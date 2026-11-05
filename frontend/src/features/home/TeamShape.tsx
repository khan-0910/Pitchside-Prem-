import { useRef, type RefObject } from "react";

import { gsap, useGSAP } from "@/animations/gsap";
import { isCoarsePointer, prefersReducedMotion } from "@/animations/useReducedMotion";

/** Two sides around the centre circle in a 1600 x 900 frame, kept clear of the words top left. */
const spread = (lines: { y: number; pull: number; xs: number[] }[]) =>
  lines.flatMap((l) => l.xs.map((x) => ({ x, y: l.y, pull: l.pull })));
const AWAY = spread([
  { y: 300, pull: 0.2, xs: [1400] },
  { y: 400, pull: 0.34, xs: [1010, 1180, 1330, 1470] },
  { y: 520, pull: 0.55, xs: [820, 1040, 1290] },
  { y: 625, pull: 0.78, xs: [640, 950, 1400] },
]);
const HOME = spread([
  { y: 750, pull: 0.72, xs: [320, 650, 1120] },
  { y: 810, pull: 0.52, xs: [150, 480, 880, 1290] },
  { y: 870, pull: 0.36, xs: [300, 700, 1040, 1420] },
]);

/** Twenty-two players who hold their shape and slide with the ball, like a real back line. */
export function TeamShape({ ball }: { ball: RefObject<{ x: number; y: number }> }) {
  const root = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !root.current) return;
      const dots = gsap.utils.toArray<SVGCircleElement>(".player", root.current);
      gsap.from(dots, { opacity: 0, scale: 0, transformOrigin: "50% 50%", duration: 0.5, ease: "back.out(2)", stagger: 0.025, delay: 0.5 });

      const movers = dots.map((dot, i) => ({
        pull: [...AWAY, ...HOME][i].pull,
        x: gsap.quickTo(dot, "x", { duration: 0.9, ease: "power2" }),
        y: gsap.quickTo(dot, "y", { duration: 0.9, ease: "power2" }),
      }));
      const pointer = { x: 0, y: 0 };
      const onMove = (e: PointerEvent) => {
        pointer.x = (e.clientX / window.innerWidth - 0.5) * 260;
        pointer.y = (e.clientY / window.innerHeight - 0.5) * 120;
      };
      if (!isCoarsePointer()) window.addEventListener("pointermove", onMove, { passive: true });

      let t = 0;
      const tick = () => {
        t += 0.0045;
        movers.forEach((m, i) => {
          // Slow breathing, so the shape is alive when nothing touches it.
          const sway = Math.sin(t * 2 + i * 1.3) * 7;
          m.x((ball.current.x * 1.1 + pointer.x) * m.pull + sway);
          m.y((ball.current.y * 0.9 + pointer.y) * m.pull + Math.cos(t * 1.7 + i) * 5);
        });
      };
      gsap.ticker.add(tick);
      return () => {
        gsap.ticker.remove(tick);
        window.removeEventListener("pointermove", onMove);
      };
    },
    { scope: root },
  );

  return (
    <svg ref={root} aria-hidden viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" className="pointer-events-none absolute inset-0 size-full">
      {AWAY.map((p, i) => <circle key={`a${i}`} className="player" cx={p.x} cy={p.y} r="11" fill="#0F1512" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.5" />)}
      {HOME.map((p, i) => <circle key={`h${i}`} className="player" cx={p.x} cy={p.y} r="11" fill="#fff" stroke="#0F1512" strokeOpacity="0.25" strokeWidth="1.5" />)}
    </svg>
  );
}
