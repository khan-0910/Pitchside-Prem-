import { motion } from "framer-motion";

import { DURATION, EASE } from "@/animations/presets";
import { useReducedMotion } from "@/animations/useReducedMotion";
import { ClubEmblem } from "@/components/ui/identity";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";
import { kickoff } from "@/lib/format";
import type { Fixture } from "@/types/api";

import { PitchMeter } from "./PitchMeter";

const two = (v: number) => v.toFixed(2);

/** The broadcast graphic: scoreline first, then the strip, then expected goals. */
export function Scoreboard({ fixture }: { fixture: Fixture }) {
  const p = fixture.prediction;
  const reduced = useReducedMotion();
  const played = fixture.home_goals !== null;
  const score = played ? `${fixture.home_goals}-${fixture.away_goals}` : p?.most_likely_score;

  return (
    <div>
      <p className="text-sm text-muted">{kickoff(fixture.kickoff_utc ?? fixture.match_date)}</p>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
        <div className="flex min-w-0 items-center justify-end gap-3 text-right">
          <span className="truncate font-display text-[clamp(1.2rem,2.4vw,2.4rem)] font-bold">{fixture.home_short}</span>
          <ClubEmblem tla={fixture.home_tla} size={38} />
        </div>
        <motion.div
          key={score}
          initial={reduced ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DURATION.base, ease: EASE }}
          className="num bg-deep px-3 py-1 text-center font-display text-[clamp(2rem,6vw,3.75rem)] font-black leading-none sm:px-5"
        >
          {score ?? "v"}
        </motion.div>
        <div className="flex min-w-0 items-center gap-3">
          <ClubEmblem tla={fixture.away_tla} size={38} />
          <span className="truncate font-display text-[clamp(1.2rem,2.4vw,2.4rem)] font-bold">{fixture.away_short}</span>
        </div>
      </div>
      <p className="mt-1 text-center text-sm text-muted">{played ? "Full time" : p ? "Most likely score" : "No prediction stored"}</p>
      {p && (
        <div className="mt-5">
          <div className="mb-4"><PitchMeter prediction={p} home={fixture.home_short} away={fixture.away_short} /></div>
          <ProbabilityBar prediction={p} homeLabel={fixture.home_short} awayLabel={fixture.away_short} />
          <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-muted">Expected goals, {fixture.home_short}</dt>
              <dd className="font-display text-2xl font-bold"><AnimatedNumber value={p.expected_goals.home} format={two} /></dd>
            </div>
            <div>
              <dt className="text-muted">Expected goals, {fixture.away_short}</dt>
              <dd className="font-display text-2xl font-bold"><AnimatedNumber value={p.expected_goals.away} format={two} /></dd>
            </div>
            <div>
              <dt className="text-muted">Decisiveness</dt>
              <dd className="font-display text-2xl font-bold">{p.confidence.label}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
