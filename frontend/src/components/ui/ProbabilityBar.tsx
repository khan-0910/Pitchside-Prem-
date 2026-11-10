import { motion } from "framer-motion";

import { DURATION, EASE } from "@/animations/presets";
import { useReducedMotion } from "@/animations/useReducedMotion";
import { percent } from "@/lib/format";
import type { Prediction } from "@/types/api";

import { AnimatedNumber } from "./AnimatedNumber";
import { RollingNumber } from "./RollingNumber";

interface Props {
  prediction: Prediction;
  homeLabel: string;
  awayLabel: string;
  compact?: boolean;
}

/** The broadcast strip: three segments that slide between old and new values, never reset. */
export function ProbabilityBar({ prediction, homeLabel, awayLabel, compact }: Props) {
  const { home_win: home, draw, away_win: away } = prediction.probabilities;
  const reduced = useReducedMotion();
  const transition = reduced ? { duration: 0 } : { duration: DURATION.slow, ease: EASE };
  const leader = Math.max(home, draw, away);
  const size = compact ? "text-sm font-semibold" : "text-3xl font-display font-semibold";
  const fmt = (v: number) => percent(v);

  return (
    <figure
      className="m-0"
      aria-label={`${homeLabel} ${percent(home)}, draw ${percent(draw)}, ${awayLabel} ${percent(away)}`}
    >
      <div aria-hidden className={`mb-1 flex justify-between ${size}`}>
        {([[home, ""], [draw, "text-muted"], [away, ""]] as const).map(([v, tone], i) => {
          const cls = v === leader ? "text-accent" : tone;
          // The big strip rolls like a scoreboard; the compact one in lists just counts.
          return compact
            ? <AnimatedNumber key={i} value={v} format={fmt} className={cls} />
            : <RollingNumber key={i} value={Math.round(v * 100)} suffix="%" className={cls} />;
        })}
      </div>
      <div aria-hidden className={`flex gap-0.5 overflow-hidden rounded-[2px] ${compact ? "h-1.5" : "h-2.5"}`}>
        <motion.div className="bg-accent" initial={{ flexGrow: 1 / 3 }} animate={{ flexGrow: home }} transition={transition} style={{ flexBasis: 0 }} />
        <motion.div className="bg-[#b9c1bb]" initial={{ flexGrow: 1 / 3 }} animate={{ flexGrow: draw }} transition={transition} style={{ flexBasis: 0 }} />
        <motion.div className="bg-[#0f1512]" initial={{ flexGrow: 1 / 3 }} animate={{ flexGrow: away }} transition={transition} style={{ flexBasis: 0 }} />
      </div>
      {!compact && (
        <figcaption className="mt-1 flex justify-between text-sm text-muted">
          <span>{homeLabel} win</span>
          <span>Draw</span>
          <span>{awayLabel} win</span>
        </figcaption>
      )}
    </figure>
  );
}
