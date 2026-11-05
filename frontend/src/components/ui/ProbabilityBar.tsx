import { motion } from "framer-motion";

import { DURATION, EASE } from "@/animations/presets";
import { useReducedMotion } from "@/animations/useReducedMotion";
import { percent } from "@/lib/format";
import type { Prediction } from "@/types/api";

import { AnimatedNumber } from "./AnimatedNumber";

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
  const size = compact ? "text-base" : "text-3xl font-display font-bold";
  const fmt = (v: number) => percent(v);

  return (
    <figure
      className="m-0"
      aria-label={`${homeLabel} ${percent(home)}, draw ${percent(draw)}, ${awayLabel} ${percent(away)}`}
    >
      <div aria-hidden className={`mb-1 flex justify-between ${size}`}>
        <AnimatedNumber value={home} format={fmt} className={home === leader ? "text-volt" : ""} />
        <AnimatedNumber value={draw} format={fmt} className={draw === leader ? "text-volt" : "text-muted"} />
        <AnimatedNumber value={away} format={fmt} className={away === leader ? "text-volt" : ""} />
      </div>
      <div aria-hidden className={`flex gap-0.5 overflow-hidden ${compact ? "h-1.5" : "h-3"}`}>
        <motion.div className="bg-volt" initial={{ flexGrow: 1 / 3 }} animate={{ flexGrow: home }} transition={transition} style={{ flexBasis: 0 }} />
        <motion.div className="bg-muted/60" initial={{ flexGrow: 1 / 3 }} animate={{ flexGrow: draw }} transition={transition} style={{ flexBasis: 0 }} />
        <motion.div className="bg-flood" initial={{ flexGrow: 1 / 3 }} animate={{ flexGrow: away }} transition={transition} style={{ flexBasis: 0 }} />
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
