import { useEffect, useRef } from "react";

import { gsap } from "@/animations/gsap";
import { DURATION } from "@/animations/presets";
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

const shape = (values: number[]) => values.map((v, i) => point(i, values.length, v).join(",")).join(" ");

/** Grows from the centre on load, then morphs from its old shape when the data changes. */
function Shape({ axes, color }: { axes: RadarAxis[]; color: string }) {
  const node = useRef<SVGPolygonElement>(null);
  const shown = useRef<number[]>(axes.map(() => 0));
  const reduced = useReducedMotion();
  const key = axes.map((a) => a.percentile).join();

  useEffect(() => {
    const el = node.current;
    if (!el) return;
    const target = axes.map((a) => a.percentile);
    const from = shown.current.length === target.length ? shown.current : target.map(() => 0);
    const draw = (values: number[]) => {
      shown.current = values;
      el.setAttribute("points", shape(values));
    };
    if (reduced) return draw(target);
    const state = { t: 0 };
    const tween = gsap.to(state, {
      t: 1,
      duration: DURATION.slow,
      ease: "power3.out",
      onUpdate: () => draw(from.map((f, i) => f + (target[i] - f) * state.t)),
    });
    return () => void tween.kill();
    // key holds the values, so an equal array from a refetch does not replay this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);

  return <polygon ref={node} points={shape(shown.current)} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={2} />;
}

export function Radar({ series, title }: { series: Series[]; title: string }) {
  const axes = series[0]?.axes ?? [];
  const summary = series
    .map((s) => `${s.name}: ${s.axes.map((a) => `${a.label} ${Math.round(a.percentile)}`).join(", ")}`)
    .join(". ");

  return (
    <figure className="m-0">
      <svg viewBox={`-30 -6 ${SIZE + 60} ${SIZE + 12}`} className="w-full max-w-md" role="img" aria-label={`${title}. Percentiles. ${summary}`}>
        {[25, 50, 75, 100].map((ring) => (
          <polygon key={ring} points={shape(axes.map(() => ring))} fill="none" stroke="rgb(243 245 239 / 0.13)" />
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
        {series.map((s) => <Shape key={s.name} axes={s.axes} color={s.color} />)}
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
