import { useRef, type PointerEvent } from "react";

import { useReducedMotion } from "@/animations/useReducedMotion";
import { initials } from "@/lib/format";

const hueOf = (text: string) => [...text].reduce((total, c) => (total * 31 + c.charCodeAt(0)) % 360, 7);

/** A plain kit in a colour worked out from the club code. Never a real strip. */
export function ShirtGraphic({ tla, label, size = 90 }: { tla: string; label: string; size?: number }) {
  const hue = hueOf(tla);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path
        d="M34 10 14 20 2 42l17 9 7-6v46h48V45l7 6 17-9-12-22-20-10c-3 7-9 10-16 10s-13-3-16-10z"
        fill={`hsl(${hue} 42% 30%)`}
        stroke={`hsl(${hue} 55% 66%)`}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M34 10c3 7 9 10 16 10s13-3 16-10l-5-2c-2 5-6 7-11 7s-9-2-11-7z" fill={`hsl(${hue} 55% 66%)`} />
      <text x="50" y="66" textAnchor="middle" fontSize="27" fontWeight="900" fill="#F3F5EF" fontFamily="'Big Shoulders Display', sans-serif">
        {label.slice(0, 3)}
      </text>
    </svg>
  );
}

/** Tilts toward the pointer. Hover only, so touch and reduced motion get a still card. */
export function ShirtCard({ name, tla, detail, score }: { name: string; tla: string; detail: string; score?: string }) {
  const card = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = card.current;
    if (!el || reduced || e.pointerType !== "mouse") return;
    const box = el.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width - 0.5;
    const y = (e.clientY - box.top) / box.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${x * 18}deg) rotateX(${-y * 18}deg) scale(1.03)`;
  };
  const onLeave = () => {
    if (card.current) card.current.style.transform = "";
  };

  return (
    <div ref={card} onPointerMove={onMove} onPointerLeave={onLeave} className="shirt-card">
      <ShirtGraphic tla={tla} label={initials(name)} />
      <p className="mt-1 max-w-36 truncate text-center font-display text-xl font-bold">{name}</p>
      <p className="max-w-36 truncate text-center text-sm text-muted">{detail}</p>
      {score && <p className="mt-1 text-center font-display text-3xl font-black text-volt num">{score}</p>}
    </div>
  );
}
