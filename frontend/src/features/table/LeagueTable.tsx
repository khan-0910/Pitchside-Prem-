import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretUp } from "@phosphor-icons/react/dist/csr/CaretUp";
import { useQuery } from "@tanstack/react-query";
import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { EASE } from "@/animations/presets";
import { useReducedMotion } from "@/animations/useReducedMotion";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ClubEmblem } from "@/components/ui/identity";
import { DataState } from "@/components/ui/states";
import { day, signed } from "@/lib/format";
import { RACES, raceFor, raceLabel } from "@/lib/tableRace";
import { api } from "@/services/api";
import type { StandingRow, Standings } from "@/types/api";

const HOLD_MS = 600;
const goalDifference = (v: number) => signed(v, 0);
const SLIDE_S = 0.9;

function Move({ row }: { row: StandingRow }) {
  const by = row.before ? row.before.position - row.position : 0;
  if (by === 0) return <span className="sr-only">{row.before ? "Same place" : ""}</span>;
  const Icon = by > 0 ? CaretUp : CaretDown;
  return (
    <span className={`inline-flex items-center text-[13px] font-semibold ${by > 0 ? "text-accent" : "text-alert"}`}>
      <Icon aria-hidden size={12} weight="fill" />
      {Math.abs(by)}
      <span className="sr-only">{by > 0 ? " up" : " down"}</span>
    </span>
  );
}

/**
 * The table opens as it stood before the latest matchweek, then the clubs slide to where they
 * stand now while their numbers count on, so the eye catches who went up and who went down.
 */
function Rows({ data }: { data: Standings }) {
  const reduced = useReducedMotion();
  const root = useRef<HTMLTableElement>(null);
  const seen = useInView(root, { once: true, amount: 0.4 });
  const moves = Boolean(data.moves_since) && data.table.some((r) => r.before && r.before.position !== r.position);
  const [settled, setSettled] = useState(reduced || !moves);

  useEffect(() => {
    if (settled || !seen) return;
    const timer = window.setTimeout(() => setSettled(true), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [settled, seen]);

  const order = settled ? data.table : [...data.table].sort((a, b) => (a.before?.position ?? a.position) - (b.before?.position ?? b.position));

  return (
    <table ref={root} className="w-full text-left">
      <caption className="sr-only">League table, season {data.season_id}</caption>
      <thead>
        <tr className="chalk border-b text-sm text-muted">
          <th scope="col" className="w-8 py-1.5 pl-2 font-normal">#</th>
          <th scope="col" className="w-9 py-1.5 font-normal"><span className="sr-only">Move</span></th>
          <th scope="col" className="py-1.5 font-normal">Club</th>
          <th scope="col" className="py-1.5 text-right font-normal">P</th>
          <th scope="col" className="py-1.5 text-right font-normal">GD</th>
          <th scope="col" className="py-1.5 text-right font-normal">Pts</th>
        </tr>
      </thead>
      <tbody className="num">
        {order.map((row) => {
          const race = settled ? raceFor(row, data.table) : null;
          const line = settled || !row.before ? row : row.before;
          return (
            <motion.tr
              layout={reduced ? false : "position"}
              transition={{ duration: SLIDE_S, ease: EASE }}
              key={row.team_id}
              className={`chalk border-b ${race ? `race-${race}` : ""}`}
              title={raceLabel(race)}
            >
              <td className="py-1.5 pl-2">{line.position}</td>
              <td className="py-1.5">{settled && <Move row={row} />}</td>
              <td className="py-1.5">
                <span className="flex items-center gap-2"><ClubEmblem tla={row.tla} size={22} />{row.short_name}{race && <span className="sr-only"> ({raceLabel(race)})</span>}</span>
              </td>
              <td className="py-1.5 text-right"><AnimatedNumber value={line.played} countIn={false} /></td>
              <td className="py-1.5 text-right"><AnimatedNumber value={line.goal_difference} format={goalDifference} countIn={false} /></td>
              <td className="py-1.5 pr-2 text-right font-semibold"><AnimatedNumber value={line.points} countIn={false} /></td>
            </motion.tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function LeagueTable() {
  const query = useQuery({ queryKey: ["standings"], queryFn: api.standings });
  return (
    <DataState query={query} isEmpty={(d) => d.table.length === 0}>
      {(data) => (
        <>
          <Rows data={data} />
          {data.moves_since && (
            <p className="mt-2 text-sm text-muted">Arrows show moves since {day(data.moves_since)}, when the latest matchweek started.</p>
          )}
          {data.derived && (
            <p className="mt-2 text-sm text-muted">Worked out from results, so any points deduction is not included.</p>
          )}
          <ul className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            {RACES.map(({ race, label }) => (
              <li key={race} className="flex items-center gap-2"><span aria-hidden className={`race-key race-${race}`} />{label}</li>
            ))}
          </ul>
        </>
      )}
    </DataState>
  );
}
