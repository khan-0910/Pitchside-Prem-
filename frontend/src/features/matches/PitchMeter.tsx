import { motion } from "framer-motion";

import { DURATION, EASE } from "@/animations/presets";
import { useReducedMotion } from "@/animations/useReducedMotion";
import { Ball } from "@/components/football/icons";
import type { Prediction } from "@/types/api";

/** A side-on pitch. The ball rolls toward the goal of the side more likely to lose. */
export function PitchMeter({ prediction, home, away }: { prediction: Prediction; home: string; away: string }) {
  const reduced = useReducedMotion();
  const { home_win: h, away_win: a } = prediction.probabilities;
  const position = 50 + (h - a) * 44;
  const leader = Math.abs(h - a) < 0.05 ? "Too close to call" : `Leans ${h > a ? home : away}`;

  return (
    <div role="img" aria-label={leader}>
      <div className="relative h-16 overflow-hidden rounded-[4px]  bg-[repeating-linear-gradient(90deg,#0e7842_0_10%,#0b6738_10%_20%)]">
        <svg aria-hidden viewBox="0 0 400 64" preserveAspectRatio="none" className="absolute inset-0 size-full" fill="none" stroke="#fff" strokeOpacity="0.85">
          <path d="M200 0V64M0 12H42V52H0M400 12H358V52H400" />
          <circle cx="200" cy="32" r="16" vectorEffect="non-scaling-stroke" />
        </svg>
        <motion.span
          className="absolute top-1/2 -ml-3.5 -mt-3.5"
          initial={reduced ? false : { left: "50%", rotate: 0 }}
          animate={{ left: `${position}%`, rotate: (h - a) * 900 }}
          transition={{ duration: reduced ? 0 : DURATION.slow * 1.6, ease: EASE }}
        >
          <Ball size={28} />
        </motion.span>
      </div>
      <p className="mt-1 text-center text-sm text-muted">{leader}</p>
    </div>
  );
}
