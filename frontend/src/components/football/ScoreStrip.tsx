import { useQuery } from "@tanstack/react-query";

import { useReducedMotion } from "@/animations/useReducedMotion";
import { ClubEmblem } from "@/components/ui/identity";
import { kickoff } from "@/lib/format";
import { api } from "@/services/api";
import type { Fixture } from "@/types/api";

function Chip({ fixture }: { fixture: Fixture }) {
  const played = fixture.home_goals !== null;
  const line = (tla: string, goals: number | null) => (
    <span className="flex items-center gap-2">
      <ClubEmblem tla={tla} size={14} />
      <span className="font-semibold">{tla}</span>
      {played && <span className="num ml-auto pl-3 font-semibold">{goals}</span>}
    </span>
  );
  return (
    <span className="chalk flex w-[7.75rem] shrink-0 flex-col justify-center border-r px-3 py-2 text-[13px] leading-[1.3]">
      {line(fixture.home_tla, fixture.home_goals)}
      {line(fixture.away_tla, fixture.away_goals)}
      <span className="mt-0.5 truncate text-[11px] text-muted">{played ? "Full time" : kickoff(fixture.kickoff_utc)}</span>
    </span>
  );
}

/** Scores across the top, like a sports app. Real fixtures only, so it hides when there are none. */
export function ScoreStrip({ auto = false, className = "" }: { auto?: boolean; className?: string }) {
  const reduced = useReducedMotion();
  const upcoming = useQuery({ queryKey: ["upcoming", 10], queryFn: () => api.upcoming(10) });
  const results = useQuery({ queryKey: ["results", "ticker"], queryFn: () => api.results({ limit: 10 }) });
  const items = [...(results.data?.items ?? []), ...(upcoming.data ?? [])];
  if (items.length === 0) return null;

  const row = items.map((f) => <Chip key={f.fixture_id} fixture={f} />);
  return (
    <section aria-label="Latest scores and upcoming fixtures" className={`on-paper chalk border-b bg-surface ${className}`}>
      {auto && !reduced ? (
        <div className="marquee-host overflow-hidden">
          <div className="marquee">
            <div className="flex">{row}</div>
            <div aria-hidden className="flex">{items.map((f) => <Chip key={f.fixture_id} fixture={f} />)}</div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="group" aria-label="Scroll sideways for more" data-lenis-prevent-horizontal>
          <div className="flex w-max">{row}</div>
        </div>
      )}
    </section>
  );
}
