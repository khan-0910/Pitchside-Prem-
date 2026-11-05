import { useRef, type PointerEvent } from "react";

import { useReducedMotion } from "@/animations/useReducedMotion";
import { clubColours, inkOn } from "@/lib/clubs";
import { initials } from "@/lib/format";

/** A plain shirt in the club's colours, with the player's initials. */
export function ShirtGraphic({ tla, label, size = 90 }: { tla: string; label: string; size?: number }) {
  const [main, second] = clubColours(tla);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="block">
      <path
        d="M34 10 14 20 2 42l17 9 7-6v46h48V45l7 6 17-9-12-22-20-10c-3 7-9 10-16 10s-13-3-16-10z"
        fill={main}
        stroke="rgb(15 21 18 / 0.28)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M34 10c3 7 9 10 16 10s13-3 16-10l-5-2c-2 5-6 7-11 7s-9-2-11-7z" fill={second} />
      <text x="50" y="66" textAnchor="middle" fontSize="27" fontWeight="800" fill={inkOn(main)} style={{ fontStretch: "75%" }}>
        {label.slice(0, 3)}
      </text>
    </svg>
  );
}

/** Tilts toward the pointer. Mouse only, so touch and reduced motion get a still card. */
export function ShirtCard({ name, tla, detail, score }: { name: string; tla: string; detail: string; score?: string }) {
  const card = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = card.current;
    if (!el || reduced || e.pointerType !== "mouse") return;
    const box = el.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width - 0.5;
    const y = (e.clientY - box.top) / box.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg)`;
  };
  const onLeave = () => {
    if (card.current) card.current.style.transform = "";
  };

  return (
    <div ref={card} onPointerMove={onMove} onPointerLeave={onLeave} className="shirt-card">
      <ShirtGraphic tla={tla} label={initials(name)} size={76} />
      <p className="mt-1 w-full truncate text-center font-semibold">{name}</p>
      <p className="w-full truncate text-center text-sm text-muted">{detail}</p>
      {score && <p className="mt-1 text-center font-display text-3xl font-black text-accent num">{score}</p>}
    </div>
  );
}
