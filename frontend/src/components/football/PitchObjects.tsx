import { useRef } from "react";

import { gsap, useGSAP } from "@/animations/gsap";
import { prefersReducedMotion } from "@/animations/useReducedMotion";

import { Ball } from "./icons";

const Card = ({ colour }: { colour: string }) => (
  <svg width="74" height="102" viewBox="0 0 74 102" aria-hidden>
    <rect x="2" y="2" width="70" height="98" rx="7" fill={colour} />
    <rect x="2" y="2" width="70" height="98" rx="7" fill="url(#card-sheen)" />
    <defs>
      <linearGradient id="card-sheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.1" />
      </linearGradient>
    </defs>
  </svg>
);

const Cone = () => (
  <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden>
    <circle cx="26" cy="26" r="24" fill="#FF6A13" />
    <circle cx="26" cy="26" r="24" fill="none" stroke="#000" strokeOpacity="0.16" strokeWidth="2" />
    <circle cx="26" cy="26" r="11" fill="#D65200" />
    <circle cx="26" cy="26" r="5" fill="#7A2E00" />
  </svg>
);

const KIT = {
  yellow: () => <Card colour="#FFD400" />,
  red: () => <Card colour="#E0262B" />,
  cone: Cone,
  ball: () => <Ball size={64} />,
};

export interface Item {
  kind: keyof typeof KIT;
  left: string;
  top: string;
  depth: number;
  tilt: number;
}

/** Solid kit lying near the touchlines. It lifts and turns as you scroll past. Wide screens only. */
export function PitchObjects({ items }: { items: Item[] }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.utils.toArray<HTMLElement>(".kit", root.current).forEach((el) => {
        const depth = Number(el.dataset.depth);
        gsap.fromTo(el, { y: 150 * depth, rotation: Number(el.dataset.tilt) - 26 * depth }, {
          y: -150 * depth,
          rotation: Number(el.dataset.tilt) + 26 * depth,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: 0.8 },
        });
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden max-xl:hidden">
      {items.map((item, i) => {
        const Kit = KIT[item.kind];
        return (
          <div key={i} className="kit absolute" data-depth={item.depth} data-tilt={item.tilt} style={{ left: item.left, top: item.top, filter: "drop-shadow(0 16px 12px rgb(0 40 20 / 0.5))" }}>
            <div className="bob" style={{ animationDelay: `${-i * 1.7}s` }}><Kit /></div>
          </div>
        );
      })}
    </div>
  );
}
