import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Link } from "react-router-dom";

import { gsap, useGSAP } from "@/animations/gsap";
import { prefersReducedMotion } from "@/animations/useReducedMotion";
import { ClubEmblem } from "@/components/ui/identity";
import { DataState, Skeleton } from "@/components/ui/states";
import { percent } from "@/lib/format";
import { api } from "@/services/api";
import type { Simulation, Standings } from "@/types/api";

const ROW = 44;

/** Pinned on desktop: scrolling moves each club from today's place to its projected place. */
function Moving({ simulation, standings }: { simulation: Simulation; standings: Standings }) {
  const root = useRef<HTMLDivElement>(null);
  const now = new Map(standings.table.map((row) => [row.team_id, row.position]));
  const rows = simulation.results;

  useGSAP(
    () => {
      if (prefersReducedMotion() || window.innerWidth < 1024) return;
      const q = gsap.utils.selector(root);
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: root.current, start: "center center", end: "+=750", pin: true, scrub: 0.5 },
      });
      rows.forEach((row, i) => {
        const from = ((now.get(row.team_id) ?? i + 1) - 1 - i) * ROW;
        tl.fromTo(q(`[data-team="${row.team_id}"]`), { y: from }, { y: 0 }, 0);
      });
    },
    { scope: root, dependencies: [simulation.simulation_id] },
  );

  return (
    <div ref={root}>
      <div className="flex text-sm text-muted" style={{ height: 28 }}>
        <span className="flex-1">Projected finish</span>
        <span className="w-16 text-right">Points</span>
        <span className="w-16 text-right">Title</span>
        <span className="w-16 text-right max-sm:hidden">Top four</span>
      </div>
      <ol className="relative m-0 list-none p-0" style={{ height: ROW * rows.length }}>
        {rows.map((row, i) => (
          <li
            key={row.team_id}
            data-team={row.team_id}
            className="chalk absolute inset-x-0 flex items-center gap-2 border-b bg-stadium"
            style={{ top: i * ROW, height: ROW }}
          >
            <span className="num w-7 text-muted">{i + 1}</span>
            <ClubEmblem tla={row.tla} size={26} />
            <span className="min-w-0 flex-1 truncate">{row.short_name}</span>
            <span className="num w-16 text-right">{row.expected_points.toFixed(0)}</span>
            <span className={`num w-16 text-right ${row.p_title > 0.1 ? "text-gold" : ""}`}>{percent(row.p_title)}</span>
            <span className="num w-16 text-right max-sm:hidden">{percent(row.p_top4)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TableJourney() {
  const simulation = useQuery({ queryKey: ["simulation", "latest"], queryFn: api.latestSimulation });
  const standings = useQuery({ queryKey: ["standings"], queryFn: api.standings });
  return (
    <section className="relative z-10 mx-auto grid max-w-7xl gap-8 px-4 py-20 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:px-24 lg:py-32">
      <div data-pass className="max-w-md">
        <h2 className="text-[clamp(2.6rem,6vw,4.75rem)]">How could the table finish?</h2>
        <p className="mt-3 text-lg text-muted">
          {simulation.data
            ? `${simulation.data.iterations.toLocaleString("en-GB")} simulated runs of the ${simulation.data.fixtures_remaining} fixtures left. Probabilities, never promises.`
            : "Thousands of simulated runs of the fixtures left. Probabilities, never promises."}
        </p>
        <Link to="/app/simulator" className="btn-ghost mt-5">Open Season Simulator</Link>
      </div>
      <div className="min-w-0">
        <DataState query={simulation} loading={<Skeleton className="h-96 w-full" />}>
          {(sim) => (standings.data ? <Moving simulation={sim} standings={standings.data} /> : <Skeleton className="h-96 w-full" />)}
        </DataState>
      </div>
    </section>
  );
}
