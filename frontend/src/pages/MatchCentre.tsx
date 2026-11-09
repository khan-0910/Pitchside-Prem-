import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { PageTitle } from "@/components/layout/DashboardLayout";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";
import { DataState, EmptyState, SkeletonRows } from "@/components/ui/states";
import RubberSegment from "@/components/reactbits/RubberSegment";
import { BuildUp } from "@/features/matches/BuildUp";
import { ScoreGrid } from "@/features/matches/ScoreGrid";
import { Scoreboard } from "@/features/matches/Scoreboard";
import { kickoff } from "@/lib/format";
import { api } from "@/services/api";
import type { Fixture } from "@/types/api";

const PAGE = 20;
type View = "SCHEDULED" | "FINISHED";

function Form({ teamId, name }: { teamId: string; name: string }) {
  const query = useQuery({ queryKey: ["form", teamId], queryFn: () => api.teamForm(teamId) });
  return (
    <div>
      <h3 className="text-sm">{name} form</h3>
      <DataState query={query} loading={<SkeletonRows rows={2} />} isEmpty={(d) => d.matches.length === 0} empty={<EmptyState title="No results yet." />}>
        {(data) => (
          <ol className="mt-1 flex list-none flex-wrap gap-1 p-0" aria-label={`Last ${data.matches.length} results, newest first`}>
            {data.matches.map((m) => (
              <li
                key={m.fixture_id}
                title={`${m.is_home ? "v" : "at"} ${m.opponent}: ${m.goals_for}-${m.goals_against}`}
                className={`num flex size-8 items-center justify-center rounded-[2px] font-semibold ${
                  m.result === "W" ? "bg-accent text-page" : m.result === "L" ? "bg-alert text-page" : "bg-sunken"
                }`}
              >
                {m.result}
              </li>
            ))}
          </ol>
        )}
      </DataState>
    </div>
  );
}

function TeamNewsList({ fixture }: { fixture: Fixture }) {
  const query = useQuery({ queryKey: ["team-news"], queryFn: api.teamNews });
  const sides = [
    { name: fixture.home_short, players: query.data?.teams[fixture.home_team_id]?.players ?? [] },
    { name: fixture.away_short, players: query.data?.teams[fixture.away_team_id]?.players ?? [] },
  ];
  return (
    <div>
      <h3 className="text-sm">Team news</h3>
      <DataState query={query} loading={<SkeletonRows rows={2} />}>
        {() => (
          <>
            {sides.map(({ name, players }) => (
              <p key={name} className="mt-1 text-sm">
                <span className="font-medium">{name}: </span>
                {players.length === 0 ? <span className="text-muted">no regulars flagged</span> : players.map((n) => `${n.name} (${n.reason}, back: ${n.expected_return})`).join(", ")}
              </p>
            ))}
            <p className="mt-2 text-sm text-muted">From the Premier League's Fantasy data, which can lag club news. These absences feed into the prediction. Confirmed lineups are not available.</p>
          </>
        )}
      </DataState>
    </div>
  );
}

function Detail({ fixture }: { fixture: Fixture }) {
  const p = fixture.prediction;
  return (
    <div className="board mb-3 grid gap-7 lg:grid-cols-2">
      <div className="space-y-5">
        <Scoreboard fixture={fixture} />
        <Form teamId={fixture.home_team_id} name={fixture.home_short} />
        <Form teamId={fixture.away_team_id} name={fixture.away_short} />
        {fixture.home_goals === null && <TeamNewsList fixture={fixture} />}
      </div>
      <div className="space-y-4">
        {p?.score_matrix && <ScoreGrid matrix={p.score_matrix} home={fixture.home_short} away={fixture.away_short} />}
        {p && (
          <details>
            <summary className="cursor-pointer text-muted">What this prediction cannot see</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {p.limitations.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <p className="mt-2 text-sm text-muted">Model {p.model_version}. Decisiveness shows how far the chances lean, not how likely the model is to be right.</p>
          </details>
        )}
      </div>
      {p?.explanation && <BuildUp prediction={p} home={fixture.home_short} away={fixture.away_short} />}
    </div>
  );
}

export default function MatchCentre() {
  const [view, setView] = useState<View>("SCHEDULED");
  const [team, setTeam] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [count, setCount] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  const teams = useQuery({ queryKey: ["teams"], queryFn: api.teams });
  const news = useQuery({ queryKey: ["team-news"], queryFn: api.teamNews });
  const query = useQuery({
    queryKey: ["fixtures", view, team, from, to, count],
    queryFn: () => api.fixtures({
      status: view, team, date_from: from, date_to: to, limit: count, sort: view === "FINISHED" ? "desc" : "asc",
    }),
    placeholderData: (previous) => previous,
  });

  return (
    <>
      <PageTitle title="Match Centre" intro="Fixtures, results and the model's view of each match." />
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <RubberSegment
          aria-label="Fixture type"
          items={[{ value: "SCHEDULED", label: "Upcoming" }, { value: "FINISHED", label: "Results" }]}
          value={view}
          onChange={(v) => { setView(v as View); setCount(PAGE); setOpen(null); }}
          size="lg"
          trackColor="var(--color-sunken)"
          thumbColor="var(--color-accent)"
          textColor="var(--color-ink)"
          activeTextColor="var(--color-accent-ink)"
        />
        <label className="min-w-40 flex-1 text-sm text-muted sm:max-w-56">Club
          <select className="field mt-0.5 text-ink" value={team} onChange={(e) => { setTeam(e.target.value); setCount(PAGE); }}>
            <option value="">All clubs</option>
            {teams.data?.map((t) => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-muted">From
          <input type="date" className="field mt-0.5 text-ink" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-sm text-muted">To
          <input type="date" className="field mt-0.5 text-ink" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <DataState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No matches fit these filters."><p>Try a different club or date range.</p></EmptyState>}>
        {(data) => (
          <>
            <ul>
              {data.items.map((f) => (
                <li key={f.fixture_id} className="chalk border-b">
                  <button
                    type="button"
                    aria-expanded={open === f.fixture_id}
                    onClick={() => setOpen(open === f.fixture_id ? null : f.fixture_id)}
                    className="grid w-full grid-cols-1 items-center gap-x-6 gap-y-1 py-3 text-left hover:bg-surface/40 md:grid-cols-[9rem_minmax(0,1fr)_minmax(0,18rem)]"
                  >
                    <span className="text-sm text-muted">{kickoff(f.kickoff_utc ?? f.match_date)}</span>
                    <span className="font-medium">
                      {f.home_short} {f.home_goals !== null ? <span className="num mx-1 font-display text-xl font-bold">{f.home_goals}-{f.away_goals}</span> : "v"} {f.away_short}
                    </span>
                    {f.prediction ? (
                      <ProbabilityBar compact prediction={f.prediction} homeLabel={f.home_short} awayLabel={f.away_short} />
                    ) : (
                      <span className="text-sm text-muted">{f.home_goals !== null ? "Played before predictions were stored" : "No prediction stored"}</span>
                    )}
                  </button>
                  {f.home_goals === null && news.data && (
                    <p className="pb-2 text-[13px] text-muted">
                      Injury doubts: {f.home_short} {news.data.teams[f.home_team_id]?.players.length ?? 0}, {f.away_short} {news.data.teams[f.away_team_id]?.players.length ?? 0}
                    </p>
                  )}
                  {open === f.fixture_id && <Detail fixture={f} />}
                </li>
              ))}
            </ul>
            {data.total > data.items.length && (
              <button type="button" className="btn-ghost mt-4" onClick={() => setCount(count + PAGE)}>
                Show more ({data.total - data.items.length} left)
              </button>
            )}
          </>
        )}
      </DataState>
    </>
  );
}
