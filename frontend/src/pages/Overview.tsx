import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { PageTitle } from "@/components/layout/DashboardLayout";
import { ClubEmblem, PlayerAvatar } from "@/components/ui/identity";
import { DataState, EmptyState } from "@/components/ui/states";
import { FixtureRail } from "@/features/matches/FixtureRail";
import { ASSESSMENT, euros, signed } from "@/lib/format";
import { api } from "@/services/api";

function Heading({ title, to }: { title: string; to?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-lg">{title}</h2>
      {to && <Link to={to} className="text-sm text-muted underline underline-offset-4 hover:text-ink">See all</Link>}
    </div>
  );
}

const INJURY_ROWS = 6;

const zone = (position: number) =>
  position <= 4 ? "zone-top" : position <= 6 ? "zone-europe" : position >= 18 ? "zone-drop" : "";

function LeagueTable() {
  const query = useQuery({ queryKey: ["standings"], queryFn: api.standings });
  return (
    <DataState query={query} isEmpty={(d) => d.table.length === 0}>
      {(data) => (
        <>
          <table className="w-full text-left">
            <caption className="sr-only">League table, season {data.season_id}</caption>
            <thead>
              <tr className="chalk border-b text-sm text-muted">
                <th scope="col" className="w-8 py-1.5 pl-2 font-normal">#</th>
                <th scope="col" className="py-1.5 font-normal">Club</th>
                <th scope="col" className="py-1.5 text-right font-normal">P</th>
                <th scope="col" className="py-1.5 text-right font-normal">GD</th>
                <th scope="col" className="py-1.5 text-right font-normal">Pts</th>
              </tr>
            </thead>
            <tbody className="num">
              {data.table.map((row) => (
                <tr key={row.team_id} className={`chalk border-b ${zone(row.position)}`}>
                  <td className="py-1.5 pl-2 text-muted">{row.position}</td>
                  <td className="py-1.5">
                    <span className="flex items-center gap-2"><ClubEmblem tla={row.tla} size={22} />{row.short_name}</span>
                  </td>
                  <td className="py-1.5 text-right">{row.played}</td>
                  <td className="py-1.5 text-right">{signed(row.goal_difference, 0)}</td>
                  <td className="py-1.5 text-right font-semibold">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.derived && (
            <p className="mt-2 text-sm text-muted">Worked out from results, so any points deduction is not included.</p>
          )}
          <p className="mt-2 flex flex-wrap gap-x-4 text-sm text-muted">
            <span><span aria-hidden className="mr-1 inline-block size-2 bg-accent" />Top four</span>
            <span><span aria-hidden className="mr-1 inline-block size-2 bg-gold" />Top six</span>
            <span><span aria-hidden className="mr-1 inline-block size-2 bg-alert" />Relegation zone</span>
          </p>
        </>
      )}
    </DataState>
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
              <span className="num bg-surface px-2 font-display text-xl font-bold">{f.home_goals}-{f.away_goals}</span>
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
    <DataState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No player has a positive gap right now." />}>
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

function Injuries() {
  const query = useQuery({ queryKey: ["team-news"], queryFn: api.teamNews });
  return (
    <DataState query={query} isEmpty={(d) => !Object.values(d).some((t) => t.players.length)} empty={<EmptyState title="No regulars are flagged." />}>
      {(data) => (
        <ul>
          {Object.values(data).sort((a, b) => b.missing_share - a.missing_share).slice(0, INJURY_ROWS).map((t) => (
            <li key={t.team} className="chalk flex justify-between gap-4 border-b py-1.5">
              <span className="min-w-0">
                <span className="font-medium">{t.team}</span>
                <span className="block truncate text-sm text-muted">{t.players.map((p) => p.name).join(", ") || "None flagged"}</span>
              </span>
              <span className="num shrink-0 text-sm" title="Share of the usual squad's value expected to miss the next match">{Math.round(t.missing_share * 100)}% out</span>
            </li>
          ))}
        </ul>
      )}
    </DataState>
  );
}

export default function Overview() {
  return (
    <>
      <PageTitle title="Overview" />
      <div className="grid gap-10 lg:grid-cols-2 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section className="board min-w-0 lg:col-span-2 xl:col-span-2"><Heading title="Next up" to="/app/matches" /><FixtureRail /></section>
        <section aria-labelledby="table-h" className="board min-w-0"><div id="table-h"><Heading title="League table" /></div><LeagueTable /></section>
        <div className="min-w-0 space-y-10">
          <section className="board"><Heading title="Injuries" to="/app/matches" /><Injuries /></section>
          <section className="board"><Heading title="Latest results" to="/app/matches" /><Results /></section>
          <section className="board"><Heading title="Top expected goals" to="/app/players" /><Scorers /></section>
          <section className="board"><Heading title="Biggest value gaps" to="/app/transfers" /><ValueWatch /></section>
        </div>
      </div>
    </>
  );
}
