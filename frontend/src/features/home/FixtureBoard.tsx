import { useQuery } from "@tanstack/react-query";

import { useReducedMotion } from "@/animations/useReducedMotion";
import SplitFlapText from "@/components/reactbits/SplitFlapText";
import { api } from "@/services/api";
import type { Fixture } from "@/types/api";

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789: ";
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** "BHA V BRE 19:30", as an old stadium departure board would show it. */
const line = (f: Fixture) => `${f.home_tla} V ${f.away_tla} ${f.kickoff_utc ? time.format(new Date(f.kickoff_utc)) : "TBC"}`;

/** A split-flap board above the pitch that clacks through the real next fixtures. */
export function FixtureBoard() {
  const reduced = useReducedMotion();
  const query = useQuery({ queryKey: ["upcoming", 10], queryFn: () => api.upcoming(10) });
  const fixtures = query.data?.slice(0, 5) ?? [];
  if (fixtures.length === 0) return null;
  const words = fixtures.map(line);
  return (
    <figure className="m-0">
      <figcaption className="mb-1.5 text-sm text-white/80">Next on the board</figcaption>
      <SplitFlapText
        words={reduced ? words.slice(0, 1) : words}
        loop={!reduced}
        intro={!reduced}
        charset={CHARSET}
        padTo={15}
        cycleDelay={2600}
        fontSize="clamp(13px, 1.45vw, 22px)"
        gap={3}
        tileRadius={3}
        tileColor="#0f1512"
        textColor="#ffd400"
        aria-label={`Next fixtures: ${fixtures.map((f) => `${f.home_short} v ${f.away_short}`).join(", ")}`}
      />
    </figure>
  );
}
