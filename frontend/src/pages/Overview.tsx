import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { PageTitle } from "@/components/layout/DashboardLayout";
import { ClubEmblem, PlayerAvatar } from "@/components/ui/identity";
import { DataState, EmptyState } from "@/components/ui/states";
import { TicketStack } from "@/features/matches/TicketStack";
import { LeagueTable } from "@/features/table/LeagueTable";
import { ASSESSMENT, euros, signed, timeAgo } from "@/lib/format";
import { api } from "@/services/api";
import type { ClubNews } from "@/types/api";

function Heading({ title, to }: { title: string; to?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-lg">{title}</h2>
      {to && <Link to={to} className="text-sm text-muted underline underline-offset-4 hover:text-ink">See all</Link>}
    </div>
  );
}

function Results() {
  const query = useQuery({ queryKey: ["results", "recent"], queryFn: () => api.results({ limit: 6 }) });
  return (
    <DataState query={query} isEmpty={(d) => d.items.length === 0}>
      {(data) => (
        <ul>
          {data.items.map((f) => (
            <li key={f.fixture_id} className="chalk grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b py-2">
              <span className="truncate text-right">{f.home_short}</span>
              <span className="num bg-surface px-2 font-display text-xl font-semibold">{f.home_goals}-{f.away_goals}</span>
              <span className="truncate">{f.away_short}</span>
            </li>
          ))}
        </ul>
      )}
    </DataState>
  );
}

function ValueWatch() {
  const query = useQuery({ queryKey: ["undervalued", 4], queryFn: () => api.undervalued({ limit: 4 }) });
  return (
    <DataState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No player has a positive gap right now" />}>
      {(data) => (
        <ul>
          {data.items.map((v) => (
            <li key={v.player_id} className="chalk flex items-center gap-3 border-b py-2">
              <PlayerAvatar name={v.name} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate">{v.name}</p>
                <p className="truncate text-sm text-muted">{v.team_short}, {ASSESSMENT[v.assessment].toLowerCase()}</p>
              </div>
              <div className="num text-right">
                <p>{signed(v.gap_pct, 0)}%</p>
                <p className="text-sm text-muted">{euros(v.actual_eur)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DataState>
  );
}

function Scorers() {
  const query = useQuery({ queryKey: ["players", "xg"], queryFn: () => api.players({ sort: "xg", limit: 5 }) });
  return (
    <DataState query={query} isEmpty={(d) => d.items.length === 0}>
      {(data) => (
        <ol className="m-0 list-none p-0">
          {data.items.map((p) => (
            <li key={p.player_id} className="chalk flex items-center gap-3 border-b py-2">
              <PlayerAvatar name={p.name} size={34} />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="num text-sm text-muted">{p.goals} goals</span>
              <span className="num w-16 text-right">{p.xg?.toFixed(1)} xG</span>
            </li>
          ))}
        </ol>
      )}
    </DataState>
  );
}

function ClubInjuries({ club }: { club: ClubNews }) {
  const count = club.players.length;
  return (
    <details className="club-news">
      <summary>
        <ClubEmblem tla={club.tla} size={22} />
        <span className="min-w-0 flex-1 truncate font-medium">{club.team}</span>
        <span className="text-sm text-muted">{count === 0 ? "All fit" : count === 1 ? "1 player" : `${count} players`}</span>
        <span className="num w-16 text-right text-sm" title="Share of the usual squad's market value expected to miss the next match">{Math.round(club.missing_share * 100)}% out</span>
        <CaretDown aria-hidden size={16} className="club-news-caret shrink-0" />
      </summary>
      {count === 0 ? <p className="px-3 pb-3 text-sm text-muted">Nobody at this club is flagged</p> : (
        <table className="mb-2 w-full text-left text-sm">
          <caption className="sr-only">{club.team} injuries and expected returns</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="px-3 py-1 font-normal">Player</th>
              <th scope="col" className="py-1 font-normal">Issue</th>
              <th scope="col" className="px-3 py-1 text-right font-normal">Expected back</th>
            </tr>
          </thead>
          <tbody>
            {club.players.map((p) => (
              <tr key={p.player_id} className="chalk border-t">
                <td className={`px-3 py-2 ${p.regular ? "font-semibold" : ""}`}>{p.name}</td>
                <td className="py-2">{p.reason}</td>
                <td className="px-3 py-2 text-right">{p.expected_return}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}

function Injuries() {
  const query = useQuery({ queryKey: ["team-news"], queryFn: api.teamNews });
  return (
    <DataState query={query} isEmpty={(d) => Object.keys(d.teams).length === 0} empty={<EmptyState title="No injury data yet" />}>
      {(data) => (
        <>
          <div className="grid gap-x-5 gap-y-2 lg:grid-cols-2">
            {Object.values(data.teams).sort((a, b) => b.missing_share - a.missing_share || a.team.localeCompare(b.team)).map((club) => (
              <ClubInjuries key={club.team} club={club} />
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            From the Premier League's Fantasy data. Updated {data.updated_at ? timeAgo(data.updated_at).toLowerCase() : "time unknown"}. Bold names are regular starters.
          </p>
        </>
      )}
    </DataState>
  );
}

export default function Overview() {
  return (
    <>
      <PageTitle title="Overview" />
      <div className="grid gap-10 lg:grid-cols-2 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="board min-w-0 lg:col-span-2 xl:col-span-2"><Heading title="Next up" to="/app/matches" /><TicketStack /></section>
        <section aria-labelledby="table-h" className="board min-w-0"><div id="table-h"><Heading title="League table" /></div><LeagueTable /></section>
        <div className="min-w-0 space-y-10">
          <section className="board"><Heading title="Latest results" to="/app/matches" /><Results /></section>
          <section className="board"><Heading title="Top expected goals" to="/app/players" /><Scorers /></section>
          <section className="board"><Heading title="Biggest value gaps" to="/app/transfers" /><ValueWatch /></section>
        </div>
      </div>
      <section className="board mt-10"><Heading title="Injuries by club" /><Injuries /></section>
    </>
  );
}
