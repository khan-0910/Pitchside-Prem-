import { useMutation, useQuery } from "@tanstack/react-query";
import { CircleAlert, GripVertical, RotateCcw } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { PageTitle } from "@/components/layout/DashboardLayout";
import { ClubEmblem, PlayerAvatar } from "@/components/ui/identity";
import { DataState, EmptyState, ErrorState, SkeletonRows } from "@/components/ui/states";
import { AVAILABILITY, GROUPS, day, euros, percent, signed } from "@/lib/format";
import { api } from "@/services/api";
import type { PlayerSummary, SquadPlayer, WhatIfScenario } from "@/types/api";

interface Pick {
  player_id: string;
  name: string;
  detail: string;
}

function Slot({ label, pick, onClear, onDrop, accepting }: {
  label: string;
  pick: Pick | null;
  onClear: () => void;
  onDrop: (text: string) => void;
  accepting: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData("text/plain")); }}
      className={`flex min-h-20 flex-1 items-center gap-3 border border-dashed p-3 transition-colors ${over ? "border-volt bg-deep" : "chalk"}`}
    >
      {pick ? (
        <>
          <PlayerAvatar name={pick.name} size={44} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{label}</p>
            <p className="truncate font-medium">{pick.name}</p>
            <p className="truncate text-sm text-muted">{pick.detail}</p>
          </div>
          <button type="button" aria-label={`Clear ${label}`} className="text-sm text-muted underline underline-offset-4" onClick={onClear}>
            Clear
          </button>
        </>
      ) : (
        <p className="text-muted"><span className="block text-sm">{label}</span>{accepting}</p>
      )}
    </div>
  );
}

function Replacements({ teamId, picked, onPick }: { teamId: string; picked: string | null; onPick: (p: PlayerSummary) => void }) {
  const [q, setQ] = useState("");
  const search = useDeferredValue(q);
  const query = useQuery({
    queryKey: ["replacements", search],
    queryFn: () => api.players({ q: search, min_minutes: search ? 0 : 450, limit: 20 }),
    placeholderData: (previous) => previous,
  });
  return (
    <div>
      <label className="block text-sm text-muted">Search all current players
        <input type="search" className="field mt-0.5 text-flood" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name" />
      </label>
      <div className="mt-2 max-h-96 overflow-y-auto" data-lenis-prevent>
        <DataState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No player matches that name." />}>
          {(data) => (
            <ul>
              {data.items.filter((p) => p.team_id !== teamId).map((p) => (
                <li
                  key={p.player_id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", `in:${p.player_id}`)}
                  className="chalk flex items-center gap-2 border-b py-1.5"
                >
                  <GripVertical aria-hidden className="size-4 shrink-0 text-muted max-md:hidden" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p.name}</span>
                    <span className="block truncate text-sm text-muted">{p.team_short}, {euros(p.market_value_eur)}</span>
                  </span>
                  <button type="button" aria-label={`Bring in ${p.name}`} aria-pressed={picked === p.player_id} className={picked === p.player_id ? "btn-primary" : "btn-ghost"} onClick={() => onPick(p)}>
                    Bring in
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </div>
    </div>
  );
}

function SquadList({ players, picked, onPick }: { players: SquadPlayer[]; picked: string | null; onPick: (p: SquadPlayer) => void }) {
  return (
    <div className="max-h-96 overflow-y-auto" data-lenis-prevent>
      <ul>
        {players.map((p) => (
          <li
            key={p.player_id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", `out:${p.player_id}`)}
            className="chalk flex items-center gap-2 border-b py-1.5"
          >
            <GripVertical aria-hidden className="size-4 shrink-0 text-muted max-md:hidden" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{p.name}{p.in_likely_14 && <span className="ml-2 text-sm text-volt">Likely 14</span>}</span>
              <span className="block truncate text-sm text-muted">
                {euros(p.market_value_eur)}, {p.minutes.toFixed(0)} min
                {p.availability && p.availability !== "a" ? `, ${AVAILABILITY[p.availability]?.toLowerCase()}` : ""}
              </span>
            </span>
            <button type="button" aria-label={`Replace ${p.name}`} aria-pressed={picked === p.player_id} className={picked === p.player_id ? "btn-primary" : "btn-ghost"} onClick={() => onPick(p)}>
              Replace
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const pct = (v: number) => percent(v, 1);

function Result({ s }: { s: WhatIfScenario }) {
  const stats: [string, string][] = [
    ["Squad value", `${euros(s.squad_value.before)} to ${euros(s.squad_value.after)}`],
    ["Change", euros(s.squad_value.change)],
    ["Goal output per 90, likely 14", `${s.model_inputs.squad_goal_output_per_90.before.toFixed(3)} to ${s.model_inputs.squad_goal_output_per_90.after.toFixed(3)}`],
  ];
  const groups = [...new Set([...Object.keys(s.positional_balance.before), ...Object.keys(s.positional_balance.after)])];
  const changedGroups = groups.filter((g) => (s.positional_balance.before[g] ?? 0) !== (s.positional_balance.after[g] ?? 0));

  return (
    <section aria-label="Scenario result" className="mt-8">
      <p className="flex items-center gap-2 text-amber"><CircleAlert aria-hidden className="size-4" /> Hypothetical scenario. Nothing here has happened.</p>
      <h2 className="mt-1 text-4xl">{s.team}: {s.player_in.name} for {s.player_out.name}</h2>
      {s.position_warning && <p className="mt-1 text-amber">{s.position_warning}</p>}
      {s.notes.map((n) => <p key={n} className="mt-1 text-muted">{n}</p>)}

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="num text-xl">{value}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-7 text-2xl">Match predictions, before and after</h3>
      <div className="mt-2 overflow-x-auto" data-lenis-prevent-horizontal>
        <table className="w-full min-w-[34rem] text-left">
          <thead>
            <tr className="chalk border-b text-sm text-muted">
              <th scope="col" className="py-1.5 font-normal">Match</th>
              <th scope="col" className="py-1.5 text-right font-normal">{s.team} win before</th>
              <th scope="col" className="py-1.5 text-right font-normal">After</th>
              <th scope="col" className="py-1.5 text-right font-normal">Change</th>
              <th scope="col" className="py-1.5 text-right font-normal">xG change</th>
            </tr>
          </thead>
          <tbody className="num">
            {s.matches.map((m) => (
              <tr key={m.fixture_id} className="chalk border-b">
                <td className="py-2">
                  {m.home_team} v {m.away_team}
                  <span className="block text-sm text-muted">{day(m.date)}</span>
                </td>
                <td className="py-2 text-right">{pct(m.is_home ? m.before.home_win : m.before.away_win)}</td>
                <td className="py-2 text-right">{pct(m.is_home ? m.after.home_win : m.after.away_win)}</td>
                <td className={`py-2 text-right ${m.win_change > 0.0005 ? "text-volt" : m.win_change < -0.0005 ? "text-alert" : ""}`}>{signed(m.win_change * 100, 1)} pts</td>
                <td className="py-2 text-right">{signed(m.expected_goals_change, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-7 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-2xl">What improves</h3>
          {s.trade_offs.advantages.length === 0 && <p className="text-muted">No tracked statistic improves by 10% or more.</p>}
          <ul className="mt-1 list-disc pl-5">{s.trade_offs.advantages.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
        <div>
          <h3 className="text-2xl">What gets worse</h3>
          {s.trade_offs.disadvantages.length === 0 && <p className="text-muted">No tracked statistic falls by 10% or more.</p>}
          <ul className="mt-1 list-disc pl-5">{s.trade_offs.disadvantages.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      </div>
      {changedGroups.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          Positional balance: {changedGroups.map((g) => `${GROUPS[g]} ${s.positional_balance.before[g] ?? 0} to ${s.positional_balance.after[g] ?? 0}`).join(", ")}.
        </p>
      )}
      <details className="mt-5">
        <summary className="cursor-pointer text-muted">Assumptions behind this scenario</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{s.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
      </details>
      <p className="mt-3 text-sm text-muted">Saved as scenario {s.scenario_id}. Model {s.model_version}.</p>
    </section>
  );
}

export default function WhatIfLab() {
  const [team, setTeam] = useState("");
  const [out, setOut] = useState<Pick | null>(null);
  const [incoming, setIncoming] = useState<Pick | null>(null);
  const [fixtures, setFixtures] = useState<string[]>([]);

  const teams = useQuery({ queryKey: ["teams"], queryFn: api.teams });
  const squad = useQuery({ queryKey: ["squad", team], queryFn: () => api.squad(team), enabled: Boolean(team) });
  const run = useMutation({ mutationFn: api.replacement });
  const crest = teams.data?.find((t) => t.team_id === team);

  const pickOut = (p: SquadPlayer) => {
    setOut({ player_id: p.player_id, name: p.name, detail: `${euros(p.market_value_eur)}, ${p.minutes.toFixed(0)} min this season` });
    run.reset();
  };
  const pickIn = (p: PlayerSummary) => {
    setIncoming({ player_id: p.player_id, name: p.name, detail: `${p.team_short}, ${euros(p.market_value_eur)}` });
    run.reset();
  };
  const reset = () => {
    setOut(null);
    setIncoming(null);
    setFixtures([]);
    run.reset();
  };
  const onDrop = async (text: string) => {
    const [kind, id] = text.split(":");
    if (kind === "out") {
      const player = squad.data?.players.find((p) => p.player_id === id);
      if (player) pickOut(player);
    } else if (kind === "in" && id) {
      const player = await api.player(id);
      pickIn(player);
    }
  };

  return (
    <>
      <PageTitle title="What-If Lab" intro="Swap one player and the match model predicts again from the changed squad. Every result here is hypothetical." />
      <label className="block max-w-sm text-sm text-muted">Club
        <span className="mt-0.5 flex items-center gap-2">
          {crest && <ClubEmblem tla={crest.tla} size={36} />}
          <select className="field text-flood" value={team} onChange={(e) => { setTeam(e.target.value); reset(); }}>
            <option value="">Choose a club</option>
            {teams.data?.map((t) => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
          </select>
        </span>
      </label>

      {!team && <div className="mt-5"><EmptyState title="Choose a club to load its squad." /></div>}

      {team && (
        <>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Slot label="Player leaving" pick={out} onClear={() => setOut(null)} onDrop={onDrop} accepting="Drag from the squad, or press Replace" />
            <Slot label="Player joining" pick={incoming} onClear={() => setIncoming(null)} onDrop={onDrop} accepting="Drag from the search, or press Bring in" />
          </div>
          <div className="mt-6 grid gap-8 lg:grid-cols-2">
            <section>
              <h2 className="text-3xl">{squad.data?.team ?? "Squad"}</h2>
              <DataState query={squad} loading={<SkeletonRows />}>
                {(data) => <SquadList players={data.players} picked={out?.player_id ?? null} onPick={pickOut} />}
              </DataState>
            </section>
            <section>
              <h2 className="text-3xl">Replacement</h2>
              <Replacements teamId={team} picked={incoming?.player_id ?? null} onPick={pickIn} />
            </section>
          </div>
          {squad.data && squad.data.fixtures.length > 0 && (
            <fieldset className="mt-6">
              <legend className="text-sm text-muted">Fixtures to predict. Leave all clear for the next five.</legend>
              <div className="mt-1 flex flex-wrap gap-x-5">
                {squad.data.fixtures.map((f) => (
                  <label key={f.fixture_id} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#B8FF54]"
                      checked={fixtures.includes(f.fixture_id)}
                      onChange={(e) => setFixtures(e.target.checked ? [...fixtures, f.fixture_id] : fixtures.filter((x) => x !== f.fixture_id))}
                    />
                    {f.home_team} v {f.away_team}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-primary"
              disabled={!out || !incoming || run.isPending}
              onClick={() => out && incoming && run.mutate({ team_id: team, player_out_id: out.player_id, player_in_id: incoming.player_id, fixture_ids: fixtures })}
            >
              {run.isPending ? "Predicting" : "Apply replacement"}
            </button>
            <button type="button" className="btn-ghost" onClick={reset}>
              <RotateCcw aria-hidden className="size-4" /> Reset
            </button>
          </div>
          {run.isError && <div className="mt-4"><ErrorState error={run.error} /></div>}
          {run.data && <Result s={run.data} />}
        </>
      )}
    </>
  );
}
