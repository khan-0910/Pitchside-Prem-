import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { gsap, useGSAP } from "@/animations/gsap";
import { prefersReducedMotion } from "@/animations/useReducedMotion";
import { Radar } from "@/components/charts/Radar";
import { PitchObjects, type Item } from "@/components/football/PitchObjects";
import { ShirtCard } from "@/components/football/ShirtCard";
import { PlayerAvatar } from "@/components/ui/identity";
import { DataState, EmptyState, Skeleton } from "@/components/ui/states";
import { PinnedFixtures } from "@/features/matches/FixtureRail";
import { Scoreboard } from "@/features/matches/Scoreboard";
import { ValuationScale } from "@/features/transfers/ValuationScale";
import { ASSESSMENT, day, euros, percent, signed } from "@/lib/format";
import { api } from "@/services/api";
import type { PlayerDetail, RadarAxis } from "@/types/api";

/** The one entrance on the page: a team sheet dropped onto the grass, settling flat. */
export function Sheet({ children, tilt = -1.6, tint = "tint-mint" }: { children: ReactNode; tilt?: number; tint?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(root.current, {
        y: 70, rotation: tilt, duration: 0.9, ease: "power3.out",
        scrollTrigger: { trigger: root.current, start: "top 88%", once: true },
      });
    },
    { scope: root },
  );
  return <div ref={root} className={`sheet min-w-0 ${tint}`}>{children}</div>;
}

export function Band({ id, title, lead, children, to, cta, kit, tilt, tint }: {
  id?: string;
  title: string;
  lead: string;
  children: ReactNode;
  to: string;
  cta: string;
  kit?: Item[];
  tilt?: number;
  tint?: string;
}) {
  return (
    <section id={id} className="relative z-10">
      {kit && <PitchObjects items={kit} />}
      <div className="relative mx-auto grid max-w-[82rem] gap-8 px-[7vw] py-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-14 lg:py-28 2xl:px-10">
        <div data-pass className="max-w-sm">
          <h2 className="text-[clamp(2rem,3.4vw,3.1rem)]">{title}</h2>
          <p className="mt-3 text-[1.05rem] leading-snug text-muted">{lead}</p>
          <Link to={to} className="btn-ghost mt-5 hover:bg-white hover:!text-[#0f1512]">{cta}</Link>
        </div>
        <Sheet tilt={tilt} tint={tint}>{children}</Sheet>
      </div>
    </section>
  );
}

const HomeSkeleton = () => <Skeleton className="h-64 w-full" />;

export function MatchSection() {
  const query = useQuery({ queryKey: ["upcoming", 1], queryFn: () => api.upcoming(1) });
  return (
    <Band tint="tint-peach" id="intelligence" title="Who is likely to win the next match?" lead="Win, draw and loss chances from form, Elo strength and squad data, scored against bookmaker prices." to="/app/matches" cta="Open Match Centre" kit={[{ kind: "yellow", left: "1.5%", top: "62%", depth: 0.8, tilt: -14 }]}>
      <DataState query={query} loading={<HomeSkeleton />} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No upcoming fixtures are loaded." />}>
        {(data) => <Scoreboard fixture={data[0]} />}
      </DataState>
    </Band>
  );
}

export function FixturesSection() {
  const query = useQuery({ queryKey: ["upcoming", 10], queryFn: () => api.upcoming(10) });
  if (!query.data?.length) return null;
  return (
    <section className="relative z-10 py-14">
      <div className="mx-auto max-w-[82rem] px-[7vw] 2xl:px-10">
        <h2 data-pass className="mb-6 text-[clamp(2rem,3.4vw,3.1rem)]">Next on the fixture list</h2>
      </div>
      <PinnedFixtures fixtures={query.data} />
    </section>
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
    <Band tint="tint-lilac" title="Which players play alike?" lead="Per-90 profiles compared within sensible positions, so a score means two players do similar work." to="/app/players" cta="Open Player Lab" tilt={1.4} kit={[{ kind: "cone", left: "92%", top: "20%", depth: 0.5, tilt: 0 }, { kind: "cone", left: "94%", top: "58%", depth: 0.7, tilt: 0 }]}>
      <DataState query={query} loading={<HomeSkeleton />} isEmpty={(d) => !d} empty={<EmptyState title="Player profiles are not ready yet." />}>
        {(pair) => {
          const { a, b, score } = pair!;
          const radar = (p: PlayerDetail, axes: RadarAxis[]) => axes.map((axis) => ({ ...axis, percentile: p.profile?.percentiles[axis.stat] ?? 0 }));
          const axes = a.profile?.radar ?? [];
          return (
            <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
              <Radar title={`${a.name} and ${b.name}`} series={[{ name: a.name, axes, color: "#0B7A43" }, { name: b.name, axes: radar(b, axes), color: "#0F1512" }]} />
              <div>
                <div className="grid grid-cols-2 gap-2">
                  <ShirtCard name={a.name} tla={a.tla} detail={`${a.team_short}, ${a.age ?? "?"}`} />
                  <ShirtCard name={b.name} tla={b.tla} detail={`${b.team_short}, ${b.age ?? "?"}`} />
                </div>
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="font-display text-5xl font-extrabold text-accent num">{score.toFixed(0)}</span>
                  <span className="text-sm text-muted">similarity out of 100, not a probability</span>
                </p>
                <ul className="mt-2 text-sm">
                  {axes.slice(0, 3).map((axis) => (
                    <li key={axis.stat} className="chalk flex justify-between gap-2 border-t py-1">
                      <span className="text-muted">{axis.label} per 90</span>
                      <span className="num">{a.profile?.per90[axis.stat].toFixed(2)} v {b.profile?.per90[axis.stat].toFixed(2)}</span>
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
    <Band tint="tint-butter" title="Who is undervalued?" lead="An estimate of each player's next recorded value, always shown with its range so a small gap is not oversold." to="/app/transfers" cta="Open Transfer Intelligence" kit={[{ kind: "red", left: "2%", top: "24%", depth: 0.7, tilt: 16 }]}>
      <DataState query={query} loading={<HomeSkeleton />} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No player has a positive gap right now." />}>
        {(data) => {
          const v = data.items[0];
          return (
            <div>
              <div className="flex items-center gap-3">
                <PlayerAvatar name={v.name} size={46} />
                <div>
                  <p className="text-lg font-semibold">{v.name}</p>
                  <p className="text-sm text-muted">{v.team_short}, age {v.age}</p>
                </div>
                <p className="ml-auto text-right">
                  <span className="block font-display text-5xl font-extrabold text-accent num">{signed(v.gap_pct, 0)}%</span>
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
  { name: "Collect", body: "Fixtures, results, odds, player statistics and valuations come from public sources. Each keeps its own timestamp, and the last good copy survives an outage." },
  { name: "Match", body: "Clubs and players are linked across sources by birth date, name and club. Anything uncertain goes to a review list and is never guessed." },
  { name: "Build features", body: "Every feature for a match is computed only from what was known before kickoff, one fixture at a time in date order." },
  { name: "Train", body: "Models fit on older seasons, get picked on later ones, and face the newest season only once." },
  { name: "Check", body: "Results are compared with naive baselines and bookmaker prices, season by season. Predictions stay uncertain, and the numbers below show how uncertain." },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  return (
    <section className="relative z-10 mx-auto max-w-[82rem] px-[7vw] py-20 lg:py-28 2xl:px-10">
      <h2 data-pass className="max-w-2xl text-[clamp(2rem,3.4vw,3.1rem)]">How a number gets here</h2>
      <div role="tablist" aria-label="Pipeline steps" className="mt-7 flex gap-1 overflow-x-auto border-b border-white/30" data-lenis-prevent-horizontal>
        {PIPELINE.map((step, i) => (
          <button
            key={step.name}
            type="button"
            role="tab"
            id={`step-${i}`}
            aria-selected={active === i}
            aria-controls="step-panel"
            onClick={() => setActive(i)}
            className={`relative min-h-11 shrink-0 px-3 font-semibold transition-colors sm:px-5 ${active === i ? "text-accent" : "text-muted hover:text-ink"}`}
          >
            <span className="num mr-2 text-sm">{i + 1}</span>{step.name}
            {active === i && <span aria-hidden className="absolute inset-x-0 -bottom-px h-[3px] bg-accent" />}
          </button>
        ))}
      </div>
      <p id="step-panel" role="tabpanel" aria-labelledby={`step-${active}`} className="mt-5 min-h-24 max-w-2xl text-xl font-medium leading-snug">
        {PIPELINE[active].body}
      </p>
    </section>
  );
}

export function WhatIfSection() {
  const query = useQuery({ queryKey: ["scenario", "demo-latest"], queryFn: () => api.scenario("demo-latest") });
  return (
    <Band tint="tint-rose" title="What if a club swapped a player?" lead="A swap changes the squad numbers the match model reads, then the real model predicts again." to="/app/what-if" cta="Open What-If Lab" kit={[{ kind: "ball", left: "93%", top: "30%", depth: 0.9, tilt: 0 }]}>
      <DataState query={query} loading={<HomeSkeleton />}>
        {(s) => {
          const m = s.matches[0];
          return (
            <div>
              <p className="text-sm font-medium text-amber">Hypothetical scenario</p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight">{s.team}: {s.player_in.name} for {s.player_out.name}</p>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted">Squad value</dt>
                  <dd className="num font-display text-2xl font-bold">{euros(s.squad_value.before)} to {euros(s.squad_value.after)}</dd>
                </div>
                {m && (
                  <div>
                    <dt className="text-sm text-muted">{m.home_team} v {m.away_team}, {s.team} win chance</dt>
                    <dd className="num font-display text-2xl font-bold">
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
