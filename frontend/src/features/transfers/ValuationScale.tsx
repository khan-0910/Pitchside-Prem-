import { motion } from "framer-motion";

import { DURATION, EASE } from "@/animations/presets";
import { useReducedMotion } from "@/animations/useReducedMotion";
import { Ball } from "@/components/football/icons";
import { euros } from "@/lib/format";

interface Props {
  actual: number;
  predicted: number;
  low: number;
  high: number;
  highlight?: boolean;
  animateOnView?: boolean;
}

/** One horizontal scale: recorded value, the model's range, and the model's estimate. */
export function ValuationScale({ actual, predicted, low, high, highlight, animateOnView }: Props) {
  const reduced = useReducedMotion();
  const top = Math.max(actual, predicted, high) * 1.08;
  const at = (v: number) => (v / top) * 100;
  const motionProps = animateOnView ? { whileInView: { scaleX: 1 }, viewport: { once: true, amount: 0.6 } } : { animate: { scaleX: 1 } };

  return (
    <div role="img" aria-label={`Recorded value ${euros(actual)}. Model estimate ${euros(predicted)}, range ${euros(low)} to ${euros(high)}.`}>
      <div aria-hidden className="relative h-14">
        <div className="chalk absolute inset-x-0 top-6 border-t" />
        <motion.div
          className={`absolute top-[21px] h-1.5 origin-left ${highlight ? "bg-volt/40" : "bg-flood/20"}`}
          style={{ left: `${at(low)}%`, width: `${at(high) - at(low)}%` }}
          initial={reduced ? false : { scaleX: 0 }}
          {...motionProps}
          transition={{ duration: DURATION.slow, ease: EASE }}
        />
        <span className="absolute top-3 h-6 w-0.5 bg-flood" style={{ left: `${at(actual)}%` }} />
        <motion.span
          className="absolute top-[14px] -translate-x-1/2"
          initial={reduced ? false : { left: `${at(actual)}%` }}
          {...(animateOnView
            ? { whileInView: { left: `${at(predicted)}%` }, viewport: { once: true, amount: 0.6 } }
            : { animate: { left: `${at(predicted)}%` } })}
          style={reduced ? { left: `${at(predicted)}%` } : undefined}
          transition={{ duration: DURATION.slow, ease: EASE, delay: 0.15 }}
        >
          <Ball size={20} />
        </motion.span>
      </div>
      <div aria-hidden className="flex flex-wrap justify-between gap-x-6 text-sm">
        <span>Recorded <strong className="num font-semibold">{euros(actual)}</strong></span>
        <span className={highlight ? "text-volt" : ""}>Model <strong className="num font-semibold">{euros(predicted)}</strong></span>
        <span className="text-muted">Range <span className="num">{euros(low)} to {euros(high)}</span></span>
      </div>
    </div>
  );
}
