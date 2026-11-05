import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Radar } from "@/components/charts/Radar";
import { FloatingIcons } from "@/components/football/FloatingIcons";
import { PitchMark } from "@/components/football/PitchMark";
import { ShirtCard } from "@/components/football/ShirtCard";
import { PlayerAvatar } from "@/components/ui/identity";
import { DataState, EmptyState, Skeleton } from "@/components/ui/states";
import { PinnedFixtures } from "@/features/matches/FixtureRail";
import { Scoreboard } from "@/features/matches/Scoreboard";
import { ValuationScale } from "@/features/transfers/ValuationScale";
import { ASSESSMENT, day, euros, percent, signed } from "@/lib/format";
import { api } from "@/services/api";
import type { ModelInfo, PlayerDetail, RadarAxis } from "@/types/api";

export function Band({ id, title, lead, children, to, cta, mark, seed }: {
  id?: string;
  title: string;
  lead: string;
  children: ReactNode;
  to: string;
  cta: string;
  mark: "circle" | "box" | "corner" | "arc";
  seed: number;
}) {
  return (
    <section id={id} className="relative z-10 overflow-hidden">
      <PitchMark mark={mark} className="right-0 top-6 w-[62%] max-w-3xl max-sm:w-full" />
      <FloatingIcons count={8} seed={seed} />
      <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-20 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:px-24 lg:py-28">
        <div data-pass className="max-w-md">
          <h2 className="text-[clamp(2.6rem,6vw,4.75rem)]">{title}</h2>
          <p className="mt-3 text-lg text-flood/75">{lead}</p>
          <Link to={to} className="btn-ghost mt-5">{cta}</Link>
        </div>
        <div className="board min-w-0">{children}</div>
      </div>
    </section>
  );
}

const HomeSkeleton = () => <Skeleton className="h-64 w-full" />;

export function MatchSection() {
  const query = useQuery({ queryKey: ["upcoming", 1], queryFn: () => api.upcoming(1) });
  return (
    <Band id="intelligence" title="Who is likely to win the next match?" lead="Win, draw and loss chances from form, Elo strength and squad data, scored against bookmaker prices." to="/app/matches" cta="Open Match Centre" mark="circle" seed={1}>
      <DataState query={query} loading={<HomeSkeleton />} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No upcoming fixtures are loaded." />}>
        {(data) => <Scoreboard fixture={data[0]} />}
      </DataState>
    </Band>
  );
}

function usePlayerPair() {
  return useQuery({
    queryKey: ["home-pair"],
    queryFn: async () => {
      const list = await api.players({ position_group: "W", min_minutes: 450, sort: "xg", limit: 1 });
      const lead = list.items[0];
      if (!lead) return null;
      const similar = await api.similar(lead.player_id, { limit: 1, exclude_team: true });
      const match = similar.items[0];
      if (!match) return null;
      const [a, b] = await Promise.all([api.player(lead.player_id), api.player(match.player_id)]);
      return { a, b, score: match.similarity_score };
    },
  });
}

export function PlayerSection() {
  const query = usePlayerPair();
  return (
    <Band title="Which players play alike?" lead="Per-90 profiles compared within sensible positions, so a score means two players do similar work." to="/app/players" cta="Open Player Lab" mark="box" seed={2}>
      <DataState query={query} loading={<HomeSkeleton />} isEmpty={(d) => !d} empty={<EmptyState title="Player profiles are not ready yet." />}>
        {(pair) => {
          const { a, b, score } = pair!;
          const radar = (p: PlayerDetail, axes: RadarAxis[]) => axes.map((axis) => ({ ...axis, percentile: p.profile?.percentiles[axis.stat] ?? 0 }));
          const axes = a.profile?.radar ?? [];
          return (
            <div className="grid items-center gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
              <Radar title={`${a.name} and ${b.name}`} series={[{ name: a.name, axes, color: "#B8FF54" }, { name: b.name, axes: radar(b, axes), color: "#F3F5EF" }]} />
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <ShirtCard name={a.name} tla={a.tla} detail={`${a.team_short}, ${a.age ?? "?"}`} />
                  <ShirtCard name={b.name} tla={b.tla} detail={`${b.team_short}, ${b.age ?? "?"}`} />
                </div>
                <p>
                  <span className="block font-display text-6xl font-black text-volt num">{score.toFixed(0)}</span>
                  <span className="text-sm text-muted">Similarity score out of 100. Not a probability.</span>
                </p>
                <ul className="text-sm">
                  {axes.slice(0, 3).map((axis) => (
                    <li key={axis.stat} className="chalk flex justify-between gap-2 border-b py-1">
                      <span className="text-muted">{axis.label}</span>
                      <span className="num">{a.profile?.per90[axis.stat].toFixed(2)} / {b.profile?.per90[axis.stat].toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        }}
      </DataState>
    </Band>
  );
}

export function TransferSection() {
  const query = useQuery({ queryKey: ["undervalued", "home"], queryFn: () => api.undervalued({ limit: 1 }) });
  return (
    <Band title="Who is undervalued?" lead="An estimate of each player's next recorded value, always shown with its range so a small gap is not oversold." to="/app/transfers" cta="Open Transfer Intelligence" mark="corner" seed={3}>
      <DataState query={query} loading={<HomeSkeleton />} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No player has a positive gap right now." />}>
        {(data) => {
          const v = data.items[0];
          return (
            <div>
              <div className="flex items-center gap-3">
                <PlayerAvatar name={v.name} size={46} highlight />
                <div>
                  <p className="text-xl font-medium">{v.name}</p>
                  <p className="text-sm text-muted">{v.team_short}, age {v.age}</p>
                </div>
                <p className="ml-auto text-right">
                  <span className="block font-display text-5xl font-black text-volt num">{signed(v.gap_pct, 0)}%</span>
                  <span className="text-sm text-muted">{ASSESSMENT[v.assessment]}</span>
                </p>
              </div>
              <div className="mt-6">
                <ValuationScale actual={v.actual_eur} predicted={v.predicted_eur} low={v.low_eur} high={v.high_eur} highlight={v.assessment === "model_undervalued"} animateOnView />
              </div>
              <p className="mt-4 text-sm text-muted">
                Recorded value from the transfermarkt-datasets dump, observed {day(v.valuation_date)}. {data.note}
              </p>
            </div>
          );
        }}
      </DataState>
    </Band>
  );
}

const PIPELINE = [
  { name: "Collect", body: "Fixtures, results, odds, player statistics and valuations come from five public sources. Each keeps its own timestamp, and the last good copy survives an outage." },
  { name: "Match", body: "Clubs and players are linked across sources by birth date, name and club. Anything uncertain goes to a review list and is never guessed." },
  { name: "Build features", body: "Every feature for a match is computed only from what was known before kickoff, one fixture at a time in date order." },
  { name: "Train", body: "Models fit on older seasons, get picked on later ones, and face the newest season only once." },
  { name: "Check", body: "Results are compared with naive baselines and bookmaker prices, season by season. Predictions stay uncertain, and the numbers below show how uncertain." },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-8 lg:px-24 lg:py-28">
      <h2 data-pass className="max-w-2xl text-[clamp(2.6rem,6vw,4.75rem)]">How a number gets here</h2>
      <div role="tablist" aria-label="Pipeline steps" className="chalk mt-8 flex gap-1 overflow-x-auto border-b" data-lenis-prevent-horizontal>
        {PIPELINE.map((step, i) => (
          <button
            key={step.name}
            type="button"
            role="tab"
            id={`step-${i}`}
            aria-selected={active === i}
            aria-controls="step-panel"
            onClick={() => setActive(i)}
            className={`relative min-h-11 shrink-0 px-3 font-medium transition-colors sm:px-5 ${active === i ? "text-volt" : "text-muted hover:text-flood"}`}
          >
            <span className="num mr-2 text-sm">{i + 1}</span>{step.name}
            {active === i && <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-volt" />}
          </button>
        ))}
      </div>
      <p id="step-panel" role="tabpanel" aria-labelledby={`step-${active}`} className="mt-5 min-h-24 max-w-2xl text-xl">
        {PIPELINE[active].body}
      </p>
    </section>
  );
}

function metric(model: ModelInfo, candidate: string, name: string) {
  return model.metrics.test?.[candidate]?.[name];
}

export function Transparency() {
  const query = useQuery({ queryKey: ["model-metrics"], queryFn: api.modelMetrics });
  return (
    <Band title="How good is it, really?" lead="Measured on matches the model never trained on. Lower is better for both scores." to="/app/models" cta="See Model Performance" mark="arc" seed={5}>
      <DataState query={query} loading={<HomeSkeleton />} isEmpty={(d) => !d.match} empty={<EmptyState title="No trained match model yet." />}>
        {(data) => {
          const m = data.match!;
          const rows = [
            { label: "Pitchside", loss: metric(m, "model", "log_loss"), brier: metric(m, "model", "brier"), strong: true },
            { label: "Bookmakers, closing prices", loss: metric(m, "bookmaker_closing", "log_loss"), brier: metric(m, "bookmaker_closing", "brier") },
            { label: "Bookmakers, earlier prices", loss: metric(m, "bookmaker_pre_match", "log_loss"), brier: metric(m, "bookmaker_pre_match", "brier") },
            { label: "Historical frequencies", loss: metric(m, "baseline_frequency", "log_loss"), brier: metric(m, "baseline_frequency", "brier") },
          ];
          return (
            <div>
              <table className="w-full text-left">
                <thead>
                  <tr className="chalk border-b text-sm text-muted">
                    <th className="py-2 font-normal">Forecast</th>
                    <th className="py-2 text-right font-normal">Log loss</th>
                    <th className="py-2 text-right font-normal">Brier score</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {rows.map((r) => (
                    <tr key={r.label} className={`chalk border-b ${r.strong ? "text-volt" : ""}`}>
                      <td className="py-2.5">{r.label}</td>
                      <td className="py-2.5 text-right">{r.loss?.toFixed(3) ?? "n/a"}</td>
                      <td className="py-2.5 text-right">{r.brier?.toFixed(3) ?? "n/a"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-sm text-muted">
                Tested on {m.n_test} matches from {day(m.test_start)} to {day(m.test_end)}. Last evaluated {day(m.trained_at)}.
              </p>
            </div>
          );
        }}
      </DataState>
    </Band>
  );
}

export function FixturesSection() {
  const query = useQuery({ queryKey: ["upcoming", 10], queryFn: () => api.upcoming(10) });
  if (!query.data?.length) return null;
  return (
    <section className="relative z-10 py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-8 lg:px-24">
        <h2 data-pass className="mb-7 text-[clamp(2.6rem,6vw,4.75rem)]">Next on the fixture list</h2>
      </div>
      <PinnedFixtures fixtures={query.data} />
    </section>
  );
}

export function WhatIfSection() {
  const query = useQuery({ queryKey: ["scenario", "demo-latest"], queryFn: () => api.scenario("demo-latest") });
  return (
    <Band title="What if a club swapped a player?" lead="A swap changes the squad numbers the match model reads, then the real model predicts again." to="/app/what-if" cta="Open What-If Lab" mark="circle" seed={4}>
      <DataState query={query} loading={<HomeSkeleton />}>
        {(s) => {
          const m = s.matches[0];
          return (
            <div>
              <p className="text-sm text-amber">Hypothetical scenario</p>
              <p className="mt-1 font-display text-4xl font-bold">
                {s.team}: {s.player_in.name} for {s.player_out.name}
              </p>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted">Squad value</dt>
                  <dd className="num text-2xl">{euros(s.squad_value.before)} to {euros(s.squad_value.after)}</dd>
                </div>
                {m && (
                  <div>
                    <dt className="text-sm text-muted">{m.home_team} v {m.away_team}, {s.team} win chance</dt>
                    <dd className="num text-2xl">
                      {percent(m.is_home ? m.before.home_win : m.before.away_win, 1)} to {percent(m.is_home ? m.after.home_win : m.after.away_win, 1)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          );
        }}
      </DataState>
    </Band>
  );
}
