import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useReducedMotion } from "@/animations/useReducedMotion";
import Stack from "@/components/reactbits/Stack";
import { DataState, EmptyState } from "@/components/ui/states";
import { kickoff } from "@/lib/format";
import { api } from "@/services/api";

import { FixtureRail, Ticket } from "./FixtureRail";

/**
 * The next fixtures as a pile of match tickets. Drag or flick the top one away, or use the arrow
 * keys; the list beside it says which ticket is on top.
 */
export function TicketStack({ limit = 8 }: { limit?: number }) {
  const reduced = useReducedMotion();
  const [top, setTop] = useState(0);
  const query = useQuery({ queryKey: ["upcoming", 10], queryFn: () => api.upcoming(10) });
  if (reduced) return <FixtureRail />;
  return (
    <DataState query={query} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No upcoming fixtures are loaded" />}>
      {(all) => {
        const fixtures = all.slice(0, limit);
        return (
          <div className="grid items-center gap-6 sm:grid-cols-[17.5rem_minmax(0,1fr)] sm:gap-10">
            <div className="mx-auto h-[13.5rem] w-[17.5rem]">
              <Stack
                cards={fixtures.map((f) => <Ticket key={f.fixture_id} fixture={f} />)}
                layout="pile"
                visible={4}
                radius={12}
                tilt={16}
                onChange={setTop}
              />
            </div>
            <div>
              <p className="text-sm text-muted">Drag the top ticket away, or focus the pile and use the arrow keys.</p>
              <ol className="mt-2 list-none p-0">
                {fixtures.map((f, i) => (
                  <li key={f.fixture_id} className={`chalk flex justify-between gap-3 border-b py-2 text-sm ${i === top ? "font-semibold" : "text-muted"}`} aria-current={i === top ? "true" : undefined}>
                    <span className="truncate">{f.home_short} v {f.away_short}</span>
                    <span className="shrink-0">{kickoff(f.kickoff_utc ?? f.match_date)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        );
      }}
    </DataState>
  );
}
