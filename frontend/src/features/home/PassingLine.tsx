import { useEffect, useRef, useState, type RefObject } from "react";

import { gsap, ScrollTrigger, useGSAP } from "@/animations/gsap";
import "@/animations/home-plugins";
import { useReducedMotion } from "@/animations/useReducedMotion";
import { Ball } from "@/components/football/icons";

const BALL = 34;
const SMALL_BALL = 22;
const LINE = 0.7; // the ball stays level with this share of the screen height
const WIDE = 1280;
const LENGTH_OF_PITCH = 52;

/**
 * The page is the attacking half of a pitch. One move runs from the halfway line to the goal:
 * each [data-pass] heading is a receiver, and scrolling plays the ball between them.
 * Narrower screens have no room between the sections, so the ball runs down the left touchline.
 */
export function PassingLine({ container }: { container: RefObject<HTMLElement | null> }) {
  const path = useRef<SVGPathElement>(null);
  const ball = useRef<SVGGElement>(null);
  const spin = useRef<SVGSVGElement>(null);
  const counter = useRef<HTMLParagraphElement>(null);
  const touch = useRef<HTMLSpanElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [geometry, setGeometry] = useState<{ d: string; nodes: [number, number][]; w: number; h: number } | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const measure = () => {
      setNarrow(window.innerWidth < WIDE);
      if (window.innerWidth < WIDE) return setGeometry(null);
      const box = root.getBoundingClientRect();
      // The move stays in the wide channels and the gaps between sections, never across text.
      const inset = window.innerWidth * 0.052;
      const nodes: [number, number][] = [];
      [...root.querySelectorAll<HTMLElement>("[data-pass]")].forEach((el, i) => {
        const y = el.getBoundingClientRect().top - box.top - 44;
        const [from, to] = i % 2 ? [box.width - inset, inset] : [inset, box.width - inset];
        nodes.push([from, y], [to, y]);
      });
      if (nodes.length < 2) return;
      setGeometry({ d: nodes.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" "), nodes, w: box.width, h: box.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [container]);

  const showDistance = (progress: number) => {
    if (!counter.current) return;
    counter.current.textContent = `${Math.round(LENGTH_OF_PITCH * (1 - progress))} m to goal`;
    counter.current.style.opacity = progress > 0.01 && progress < 0.93 ? "1" : "0";
  };

  useEffect(() => {
    const root = container.current;
    const el = touch.current;
    if (!narrow || reduced || !root || !el) return;
    let frame = 0;
    // Measured on every frame, so sections that grow as their data lands never put it out of step.
    const place = () => {
      frame = 0;
      const run = root.offsetHeight - SMALL_BALL;
      const y = Math.min(Math.max(window.innerHeight * LINE - root.getBoundingClientRect().top, 0), run);
      el.style.transform = `translateY(${y}px) rotate(${(y / (Math.PI * SMALL_BALL)) * 360}deg)`;
      el.style.opacity = y >= run * 0.97 ? "0" : "1"; // the shot at goal takes over from here
      showDistance(y / run);
    };
    const schedule = () => { frame ||= requestAnimationFrame(place); };
    place();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [narrow, reduced, container]);

  useGSAP(
    () => {
      if (!geometry || !path.current || !ball.current) return;
      const length = path.current.getTotalLength();
      if (reduced) {
        gsap.set(ball.current, { opacity: 0 });
        return;
      }
      gsap.set(path.current, { strokeDasharray: length, strokeDashoffset: length });
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: container.current,
          start: "top 70%",
          end: "bottom 70%",
          scrub: 0.6,
          onUpdate: (self) => showDistance(self.progress),
        },
      });
      const turns = length / (Math.PI * BALL); // rolls, never slides
      tl.to(path.current, { strokeDashoffset: 0 }, 0)
        .to(ball.current, { motionPath: { path: path.current, align: path.current, alignOrigin: [0.5, 0.5] } }, 0)
        .to(spin.current, { rotation: turns * 360, svgOrigin: `${BALL / 2} ${BALL / 2}` }, 0)
        .to(ball.current, { opacity: 0, duration: 0.03 }, 0.97); // the shot at goal takes over from here
      ScrollTrigger.refresh();
    },
    { dependencies: [geometry, reduced], revertOnUpdate: true },
  );

  const distanceBadge = (
    <p ref={counter} aria-hidden className="on-grass num pointer-events-none fixed bottom-5 right-[5.5vw] z-30 rounded-[3px] bg-[#0f1512] px-2.5 py-1 text-sm font-semibold opacity-0 transition-opacity" />
  );
  if (narrow) {
    return reduced ? null : (
      <>
        <span
          ref={touch}
          data-testid="touch-ball"
          aria-hidden
          className="pointer-events-none absolute left-[calc(3.5vw+1.75px)] top-0 z-10 max-sm:left-[9.75px]"
          style={{ marginLeft: -SMALL_BALL / 2, filter: "drop-shadow(0 4px 3px rgb(0 40 20 / 0.5))" }}
        >
          <Ball size={SMALL_BALL} />
        </span>
        {distanceBadge}
      </>
    );
  }
  if (!geometry) return null;
  return (
    <>
      <svg aria-hidden className="pointer-events-none absolute left-0 top-0 z-0" width={geometry.w} height={geometry.h} fill="none">
        <path ref={path} d={geometry.d} stroke="#fff" strokeOpacity="0.8" strokeWidth="2" strokeDasharray="none" />
        {geometry.nodes.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="6" fill="#fff" />)}
        <g ref={ball} style={{ filter: "drop-shadow(0 7px 5px rgb(0 40 20 / 0.55))" }}>
          <svg ref={spin} width={BALL} height={BALL} overflow="visible"><Ball size={BALL} /></svg>
        </g>
      </svg>
      {distanceBadge}
    </>
  );
}
