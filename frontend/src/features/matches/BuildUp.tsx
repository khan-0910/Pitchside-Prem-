import { AnimatePresence, motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { DURATION, EASE } from "@/animations/presets";
import { useReducedMotion } from "@/animations/useReducedMotion";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";
import { percent } from "@/lib/format";
import type { BuildStep, Prediction } from "@/types/api";

import { PitchMeter } from "./PitchMeter";

const STEP_MS = 1100;
type Chances = BuildStep["probabilities"];

const points = (v: number) => {
  const n = Math.round(v * 100);
  return n === 0 ? "0" : `${n > 0 ? "+" : "−"}${Math.abs(n)}`;
};
const lean = (from: Chances, to: Chances) => (to.home_win - from.home_win) - (to.away_win - from.away_win);

/** How far one step moved the chances, in percentage points, and which way it pulled. */
function Shift({ from, to, home, away, scale }: { from: Chances; to: Chances; home: string; away: string; scale: number }) {
  const pull = lean(from, to);
  const width = Math.min(Math.abs(pull) / scale, 1) * 50;
  return (
    <span className="flex items-center gap-3 text-sm">
      <span className="num text-muted">
        {home} {points(to.home_win - from.home_win)}, draw {points(to.draw - from.draw)}, {away} {points(to.away_win - from.away_win)}
      </span>
      <span aria-hidden className="relative h-1.5 w-16 shrink-0 rounded-full bg-sunken">
        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-muted" />
        <span
          className={`absolute inset-y-0 rounded-full ${pull > 0 ? "bg-accent" : "bg-[#0f1512]"}`}
          style={{ [pull > 0 ? "right" : "left"]: "50%", width: `${width}%` }}
        />
      </span>
    </span>
  );
}

/**
 * The model's thought process. It starts from a typical match and adds one group of inputs at a
 * time; the ball and the strip move with each step until they land on the stored prediction.
 */
export function BuildUp({ prediction, home, away }: { prediction: Prediction; home: string; away: string }) {
  const steps = prediction.explanation ?? [];
  const last = steps.length - 1;
  const reduced = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const seen = useInView(root, { once: true, amount: 0.3 });
  const [at, setAt] = useState(reduced ? last : 0);
  const [playing, setPlaying] = useState(!reduced);

  useEffect(() => {
    if (!playing || !seen || at >= last) return;
    const timer = window.setTimeout(() => setAt(at + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, seen, at, last]);

  if (steps.length === 0) return null;
  const scale = Math.max(...steps.slice(1).map((s, i) => Math.abs(lean(steps[i].probabilities, s.probabilities))), 0.01);
  const current = steps[at];
  const shown = { ...prediction, probabilities: current.probabilities };
  const go = (i: number) => { setAt(i); setPlaying(false); };

  return (
    <section ref={root} aria-labelledby="build-up-title" className="lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="build-up-title">How the model got here</h3>
        <button type="button" className="btn-ghost" onClick={() => { setAt(0); setPlaying(true); }}>
          {at === last ? "Replay" : "Restart"}
        </button>
      </div>
      <p className="mt-1 max-w-[62ch] text-sm text-muted">
        It starts from a typical match, then adds one group of inputs at a time. Each step is the model's own
        arithmetic, and the last one is this prediction. Pick a step to see what it looked at.
      </p>

      <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]">
        <div className="self-start xl:sticky xl:top-24 xl:order-last">
          <p className="mb-2 text-sm text-muted">Step {at + 1} of {steps.length}: {current.title}</p>
          <div className="mb-4"><PitchMeter prediction={shown} home={home} away={away} /></div>
          <ProbabilityBar prediction={shown} homeLabel={home} awayLabel={away} />
        </div>
        <ol className="list-none p-0">
          {steps.map((s, i) => (
            <li
              key={s.key}
              className={`border-l-2 pl-4 transition-[opacity,border-color] duration-300 ${
                i === at ? "border-accent" : i < at ? "border-line" : "border-line opacity-50"
              }`}
            >
              <button
                type="button"
                aria-current={i === at ? "step" : undefined}
                onClick={() => go(i)}
                className="flex min-h-11 w-full flex-col items-start justify-center gap-0.5 py-2 text-left"
              >
                <span className={i === at ? "font-semibold" : "font-medium"}>{s.title}</span>
                {i === 0 ? (
                  <span className="num text-sm text-muted">
                    {home} {percent(s.probabilities.home_win)}, draw {percent(s.probabilities.draw)}, {away} {percent(s.probabilities.away_win)}
                  </span>
                ) : (
                  i <= at && <Shift from={steps[i - 1].probabilities} to={s.probabilities} home={home} away={away} scale={scale} />
                )}
              </button>
              <AnimatePresence initial={false}>
                {i === at && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduced ? 0 : DURATION.base, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <p className="text-sm text-muted">{s.note}</p>
                    {s.facts.length > 0 && (
                      <table className="mb-2 mt-2 w-full max-w-md text-sm">
                        <thead>
                          <tr className="text-muted">
                            <th className="py-0.5 text-left font-normal"><span className="sr-only">Input</span></th>
                            <th className="py-0.5 text-right font-normal">{home}</th>
                            <th className="py-0.5 text-right font-normal">{away}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.facts.map((f) => (
                            <tr key={f.label} className="chalk border-t">
                              <th scope="row" className="py-1 pr-3 text-left font-normal">{f.label}</th>
                              {(["home", "away"] as const).map((side) => (
                                <td key={side} className={`num py-1 pl-3 text-right ${f.edge === side ? "font-semibold" : ""}`}>
                                  {f[side] ?? <span className="text-muted">No data</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          ))}
        </ol>

      </div>
      <p className="mt-4 text-sm text-muted">
        Bold marks the side ahead on each input. The steps run in a fixed order: another order would change how big each one looks, not where they end.
      </p>
    </section>
  );
}
