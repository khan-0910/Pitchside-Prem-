import { motion } from "framer-motion";

import { DURATION, EASE } from "@/animations/presets";
import { useReducedMotion } from "@/animations/useReducedMotion";
import type { RadarAxis } from "@/types/api";

interface Series {
  name: string;
  axes: RadarAxis[];
  color: string;
}

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 112;

function point(index: number, total: number, value: number): [number, number] {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = (value / 100) * RADIUS;
  return [CENTER + Math.cos(angle) * r, CENTER + Math.sin(angle) * r];
}

const shape = (axes: RadarAxis[]) =>
  axes.map((a, i) => point(i, axes.length, a.percentile).join(",")).join(" ");

/** Percentile radar. Shapes draw on load and morph when the comparison changes. */
export function Radar({ series, title }: { series: Series[]; title: string }) {
  const reduced = useReducedMotion();
  const axes = series[0]?.axes ?? [];
  const summary = series
    .map((s) => `${s.name}: ${s.axes.map((a) => `${a.label} ${Math.round(a.percentile)}`).join(", ")}`)
    .join(". ");

  return (
    <figure className="m-0">
      <svg viewBox={`-30 -6 ${SIZE + 60} ${SIZE + 12}`} className="w-full max-w-md" role="img" aria-label={`${title}. Percentiles. ${summary}`}>
        {[25, 50, 75, 100].map((ring) => (
          <polygon
            key={ring}
            points={axes.map((_, i) => point(i, axes.length, ring).join(",")).join(" ")}
            fill="none"
            stroke="rgb(243 245 239 / 0.13)"
          />
        ))}
        {axes.map((axis, i) => {
          const [x, y] = point(i, axes.length, 118);
          const [lx, ly] = point(i, axes.length, 100);
          return (
            <g key={axis.stat}>
              <line x1={CENTER} y1={CENTER} x2={lx} y2={ly} stroke="rgb(243 245 239 / 0.13)" />
              <text x={x} y={y} fill="#929B95" fontSize="12" textAnchor={Math.abs(x - CENTER) < 12 ? "middle" : x > CENTER ? "start" : "end"} dominantBaseline="middle">
                {axis.label.length > 16 ? axis.stat.toUpperCase() : axis.label}
              </text>
            </g>
          );
        })}
        {series.map((s) => (
          <motion.polygon
            key={s.name}
            initial={reduced ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1, points: shape(s.axes) }}
            transition={{ duration: reduced ? 0 : DURATION.slow, ease: EASE }}
            style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
            fill={s.color}
            fillOpacity={0.14}
            stroke={s.color}
            strokeWidth={2}
          />
        ))}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-sm">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
        <span className="text-muted">Percentile within position</span>
      </figcaption>
    </figure>
  );
}
