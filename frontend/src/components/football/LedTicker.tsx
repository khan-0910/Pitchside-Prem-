import { useQuery } from "@tanstack/react-query";

import { useReducedMotion } from "@/animations/useReducedMotion";
import { percent } from "@/lib/format";
import { api } from "@/services/api";
import type { Fixture } from "@/types/api";

function Item({ fixture }: { fixture: Fixture }) {
  const played = fixture.home_goals !== null;
  const p = fixture.prediction?.probabilities;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap px-6">
      <span className="text-flood">{fixture.home_tla}</span>
      {played ? (
        <span className="text-volt">{fixture.home_goals}-{fixture.away_goals}</span>
      ) : (
        <span className="text-muted">v</span>
      )}
      <span className="text-flood">{fixture.away_tla}</span>
      {played ? (
        <span className="text-gold">FT</span>
      ) : p ? (
        <span className="text-gold">{percent(p.home_win)} {percent(p.draw)} {percent(p.away_win)}</span>
      ) : null}
    </span>
  );
}

/** The perimeter board. Real scores and real forecasts, never placeholder text. */
export function LedTicker({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const upcoming = useQuery({ queryKey: ["upcoming", 10], queryFn: () => api.upcoming(10) });
  const results = useQuery({ queryKey: ["results", "ticker"], queryFn: () => api.results({ limit: 10 }) });
  const items = [...(results.data?.items ?? []), ...(upcoming.data ?? [])];
  if (items.length === 0) return null;

  const row = items.map((f) => <Item key={f.fixture_id} fixture={f} />);
  return (
    <section aria-label="Latest scores and upcoming forecasts" className={`led ${className}`}>
      {reduced ? (
        <div className="overflow-x-auto py-1.5" data-lenis-prevent-horizontal>
          <div className="flex w-max">{row}</div>
        </div>
      ) : (
        <div className="led-track py-1.5">
          <div className="flex w-max">{row}</div>
          <div aria-hidden className="flex w-max">{items.map((f) => <Item key={f.fixture_id} fixture={f} />)}</div>
        </div>
      )}
    </section>
  );
}
