import { useEffect, useRef, useState, type RefObject } from "react";

import { gsap, ScrollTrigger, useGSAP } from "@/animations/gsap";
import { useReducedMotion } from "@/animations/useReducedMotion";
import { Ball } from "@/components/football/icons";

const BALL = 34;

/**
 * The page's one big idea: a single passing move that runs through every section.
 * Each [data-pass] element is a receiver. Scrolling plays the move out, and the ball follows.
 * Wide screens only, because phones need that margin for content.
 */
export function PassingLine({ container }: { container: RefObject<HTMLElement | null> }) {
  const path = useRef<SVGPathElement>(null);
  const ball = useRef<SVGGElement>(null);
  const spin = useRef<SVGSVGElement>(null);
  const [geometry, setGeometry] = useState<{ d: string; nodes: [number, number][]; w: number; h: number } | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      if (window.innerWidth < 1024) return setGeometry(null);
      const box = root.getBoundingClientRect();
      const nodes = [...root.querySelectorAll<HTMLElement>("[data-pass]")].map((el, i): [number, number] => {
        const r = el.getBoundingClientRect();
        return [i % 2 ? box.width - 56 : 56, r.top - box.top + 12];
      });
      if (nodes.length < 2) return;
      setGeometry({
        d: nodes.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" "),
        nodes,
        w: box.width,
        h: box.height,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [container]);

  useGSAP(
    () => {
      if (!geometry || !path.current || !ball.current) return;
      const length = path.current.getTotalLength();
      if (reduced) {
        gsap.set(path.current, { strokeDasharray: "none", strokeDashoffset: 0 });
        gsap.set(ball.current, { opacity: 0 });
        return;
      }
      gsap.set(path.current, { strokeDasharray: length, strokeDashoffset: length });
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: container.current, start: "top 70%", end: "bottom 70%", scrub: 0.6 },
      });
      // One full turn per circumference, so it rolls instead of sliding.
      const turns = length / (Math.PI * BALL);
      tl.to(path.current, { strokeDashoffset: 0 }, 0)
        .to(ball.current, { motionPath: { path: path.current, align: path.current, alignOrigin: [0.5, 0.5] } }, 0)
        .to(spin.current, { rotation: turns * 360, svgOrigin: `${BALL / 2} ${BALL / 2}` }, 0);
      ScrollTrigger.refresh();
    },
    { dependencies: [geometry, reduced], revertOnUpdate: true },
  );

  if (!geometry) return null;
  return (
    <svg aria-hidden className="pointer-events-none absolute left-0 top-0 z-0" width={geometry.w} height={geometry.h} fill="none">
      <path ref={path} d={geometry.d} stroke="#B8FF54" strokeOpacity="0.55" strokeWidth="2.5" strokeDasharray="none" strokeLinejoin="round" />
      {geometry.nodes.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="7" fill="#071511" stroke="#F3F5EF" strokeOpacity="0.55" strokeWidth="1.5" />
      ))}
      <g ref={ball}>
        <svg ref={spin} width={BALL} height={BALL} overflow="visible"><Ball size={BALL} /></svg>
      </g>
    </svg>
  );
}
