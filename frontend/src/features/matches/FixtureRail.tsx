import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";

import { gsap, useGSAP } from "@/animations/gsap";
import { prefersReducedMotion } from "@/animations/useReducedMotion";
import { ShirtGraphic } from "@/components/football/ShirtCard";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";
import { DataState, EmptyState } from "@/components/ui/states";
import { kickoff } from "@/lib/format";
import { api } from "@/services/api";
import type { Fixture } from "@/types/api";

export function Ticket({ fixture, white }: { fixture: Fixture; white?: boolean }) {
  return (
    <article className={`ticket on-paper w-[17.5rem] shrink-0 snap-start ${white ? "ticket-white" : ""}`}>
      <p className="text-sm text-muted">{kickoff(fixture.kickoff_utc ?? fixture.match_date)}</p>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="min-w-0 text-center">
          <span className="flex justify-center"><ShirtGraphic tla={fixture.home_tla} label={fixture.home_tla} size={46} /></span>
          <p className="mt-1 truncate text-sm font-semibold">{fixture.home_short}</p>
        </div>
        <span className="font-display text-2xl font-extrabold text-muted">v</span>
        <div className="min-w-0 text-center">
          <span className="flex justify-center"><ShirtGraphic tla={fixture.away_tla} label={fixture.away_tla} size={46} /></span>
          <p className="mt-1 truncate text-sm font-semibold">{fixture.away_short}</p>
        </div>
      </div>
      <div className="ticket-stub">
        {fixture.prediction ? (
          <>
          <p className="mb-1.5 flex justify-between text-sm text-muted">
            <span>Prediction</span>
            <span>Likely score <span className="num font-semibold text-ink">{fixture.prediction.most_likely_score}</span></span>
          </p>
          <ProbabilityBar compact prediction={fixture.prediction} homeLabel={fixture.home_short} awayLabel={fixture.away_short} />
          </>
        ) : (
          <p className="text-sm text-muted">No prediction stored.</p>
        )}
      </div>
    </article>
  );
}

/** Swipe or scroll sideways through the coming fixtures. */
export function FixtureRail({ limit = 10 }: { limit?: number }) {
  const query = useQuery({ queryKey: ["upcoming", limit], queryFn: () => api.upcoming(limit) });
  return (
    <DataState query={query} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No upcoming fixtures are loaded." />}>
      {(fixtures) => (
        <div tabIndex={0} role="group" aria-label="Upcoming fixtures, scroll sideways" className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0" data-lenis-prevent-horizontal>
          {fixtures.map((f) => <Ticket key={f.fixture_id} fixture={f} />)}
        </div>
      )}
    </DataState>
  );
}

/** Homepage version: on wide screens the page pins and vertical scroll drives the tickets sideways. */
export function PinnedFixtures({ fixtures }: { fixtures: Fixture[] }) {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || window.innerWidth < 1024 || !track.current) return;
      const distance = () => Math.max(0, track.current!.scrollWidth - window.innerWidth + 96);
      gsap.to(track.current, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: root.current,
          start: "center center",
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      });
    },
    { scope: root, dependencies: [fixtures.length] },
  );

  return (
    <div ref={root} className="overflow-x-auto lg:overflow-hidden" data-lenis-prevent-horizontal>
      <div ref={track} className="flex w-max gap-5 px-[7vw]">
        {fixtures.map((f) => <Ticket key={f.fixture_id} fixture={f} white />)}
      </div>
    </div>
  );
}
