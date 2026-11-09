import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useDeferredValue, useState } from "react";

import { useReducedMotion } from "@/animations/useReducedMotion";
import { Radar } from "@/components/charts/Radar";
import { PageTitle } from "@/components/layout/DashboardLayout";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PlayerAvatar } from "@/components/ui/identity";
import { DataState, EmptyState, SkeletonRows } from "@/components/ui/states";
import { AVAILABILITY, GROUPS, euros } from "@/lib/format";
import { PlayerCard } from "@/features/players/PlayerCard";
import { api } from "@/services/api";
import type { PlayerDetail, RadarAxis, SimilarPlayer } from "@/types/api";

function axesFor(player: PlayerDetail, axes: RadarAxis[]): RadarAxis[] {
  return axes.map((axis) => ({
    ...axis,
    percentile: player.profile?.percentiles[axis.stat] ?? 0,
    per90: player.profile?.per90[axis.stat] ?? 0,
  }));
}

function Comparison({ a, b }: { a: PlayerDetail; b: PlayerDetail }) {
  const query = useQuery({ queryKey: ["compare", a.player_id, b.player_id], queryFn: () => api.compare(a.player_id, b.player_id) });
  const axes = a.profile?.radar ?? [];
  return (
    <div className="mt-4">
      <Radar title={`${a.name} compared with ${b.name}`} series={[{ name: a.name, axes, color: "#0B7A43" }, { name: b.name, axes: axesFor(b, axes), color: "#0F1512" }]} />
      <DataState query={query} loading={<SkeletonRows rows={3} />}>
        {(data) => (
          <>
            {data.note && <p className="text-muted">{data.note}</p>}
            {data.explanation && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Lines title="Shared strengths" rows={data.explanation.shared_strengths} a={a.name} b={b.name} empty="No shared strength stands out." />
                <Lines title="Main differences" rows={data.explanation.main_differences} a={a.name} b={b.name} empty="No large difference stands out." />
              </div>
            )}
          </>
        )}
      </DataState>
    </div>
  );
}

function Lines({ title, rows, a, b, empty }: { title: string; rows: SimilarPlayer["shared_strengths"]; a: string; b: string; empty: string }) {
  return (
    <div>
      <h3 className="text-sm">{title}</h3>
      {rows.length === 0 && <p className="text-sm text-muted">{empty}</p>}
      <ul>
        {rows.map((r) => (
          <li key={r.stat} className="chalk flex justify-between gap-3 border-b py-1 text-sm">
            <span className="text-muted">{r.label}</span>
            <span className="num" title={`${a} / ${b}, per 90`}>{r.a_per90.toFixed(2)} / {r.b_per90.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Similar({ player, onCompare, compared }: { player: PlayerDetail; onCompare: (id: string) => void; compared: string | null }) {
  const [sameClub, setSameClub] = useState(false);
  const [ageMax, setAgeMax] = useState("");
  const reduced = useReducedMotion();
  const query = useQuery({
    queryKey: ["similar", player.player_id, sameClub, ageMax],
    queryFn: () => api.similar(player.player_id, { limit: 8, exclude_team: !sameClub, age_max: ageMax }),
  });
  return (
    <section className="mt-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-lg">Similar players</h3>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-4 accent-[#0B7A43]" checked={sameClub} onChange={(e) => setSameClub(e.target.checked)} />
            Include teammates
          </label>
          <label className="text-muted">Age at most
            <input type="number" min={16} max={45} className="field ml-2 !w-20 text-ink" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} />
          </label>
        </div>
      </div>
      <DataState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title={query.data?.note ?? "No comparable players fit these filters."} />}>
        {(data) => (
          <>
            <ul className="mt-2">
              {data.items.map((s, i) => (
                <motion.li
                  key={s.player_id}
                  initial={reduced ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduced ? 0 : i * 0.04 }}
                  className="chalk flex items-center gap-3 border-b py-2"
                >
                  <PlayerAvatar name={s.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{s.name}</p>
                    <p className="truncate text-sm text-muted">{s.team_short}, {s.age ?? "age unknown"}, {s.role}</p>
                  </div>
                  <span className="num w-12 text-right font-display text-2xl font-bold">{s.similarity_score.toFixed(0)}</span>
                  <button type="button" aria-label={`Compare with ${s.name}`} aria-pressed={compared === s.player_id} className={compared === s.player_id ? "btn-primary" : "btn-ghost"} onClick={() => onCompare(s.player_id)}>
                    Compare
                  </button>
                </motion.li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-muted">{data.score_note}</p>
          </>
        )}
      </DataState>
    </section>
  );
}

const oneDecimal = (v: number) => v.toFixed(1);
/** Counts up when a profile opens. Missing figures say so instead of showing a zero. */
const stat = (value: number | null, format?: (v: number) => string) =>
  value === null ? <span className="text-muted">No data</span> : <AnimatedNumber value={value} format={format} />;

function Profile({ id }: { id: string }) {
  const [compareId, setCompareId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["player", id], queryFn: () => api.player(id) });
  const other = useQuery({ queryKey: ["player", compareId], queryFn: () => api.player(compareId!), enabled: Boolean(compareId) });
  const reduced = useReducedMotion();

  return (
    <DataState query={query}>
      {(p) => (
        <article className="board">
          <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <motion.div initial={reduced ? false : { y: 40, opacity: 0, rotate: -6 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 22 }}>
              <PlayerCard player={p} />
            </motion.div>
            <div className="min-w-0">
              <h2 className="truncate text-2xl">{p.name}</h2>
              <p className="text-muted">{p.team}, {p.age ?? "age unknown"}{p.profile ? `, ${p.profile.role}` : ""}</p>
            </div>
          </header>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ["Minutes", stat(p.minutes)],
              ["Goals, assists", <>{stat(p.goals)}, {stat(p.assists)}</>],
              ["xG, xA", <>{stat(p.xg, oneDecimal)}, {stat(p.xa, oneDecimal)}</>],
              ["Recorded value", stat(p.market_value_eur, euros)],
            ] as const).map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="num text-xl">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-sm text-muted">
            This season's observed FPL statistics. {AVAILABILITY[p.availability ?? "a"] ?? "Availability unknown"}{p.news[0]?.news ? `: ${p.news[0].news}` : "."}
          </p>
          {p.profile ? (
            compareId && other.data ? (
              <>
                <button type="button" className="mt-3 text-sm text-muted underline underline-offset-4" onClick={() => setCompareId(null)}>Clear comparison</button>
                <Comparison a={p} b={other.data} />
              </>
            ) : (
              <div className="mt-4">
                <Radar title={p.name} series={[{ name: p.name, axes: p.profile.radar, color: "#0B7A43" }]} />
                <table className="mt-3 w-full max-w-md text-sm">
                  <caption className="sr-only">Per 90 values and percentiles</caption>
                  <tbody className="num">
                    {p.profile.radar.map((a) => (
                      <tr key={a.stat} className="chalk border-b">
                        <th scope="row" className="py-1 text-left font-normal text-muted">{a.label}</th>
                        <td className="py-1 text-right">{a.per90.toFixed(2)} per 90</td>
                        <td className="py-1 text-right">{a.percentile.toFixed(0)}th</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <EmptyState title={p.profile_note ?? "No profile yet."} />
          )}
          {p.profile && <Similar player={p} compared={compareId} onCompare={setCompareId} />}
        </article>
      )}
    </DataState>
  );
}

export default function PlayerLab() {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [team, setTeam] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [minutes, setMinutes] = useState("450");
  const [selected, setSelected] = useState<string | null>(null);
  const search = useDeferredValue(q);

  const teams = useQuery({ queryKey: ["teams"], queryFn: api.teams });
  const query = useQuery({
    queryKey: ["players", search, group, team, ageMin, ageMax, minutes],
    queryFn: () => api.players({ q: search, position_group: group, team, age_min: ageMin, age_max: ageMax, min_minutes: minutes, limit: 30 }),
    placeholderData: (previous) => previous,
  });
  const active = selected ?? query.data?.items[0]?.player_id ?? null;

  return (
    <>
      <PageTitle title="Player Lab" intro="Search any current player, read their per-90 profile and find who plays like them." />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <section aria-label="Find a player">
          <label className="block text-sm text-muted">Search by name
            <input type="search" className="field mt-0.5 text-ink" placeholder="Saka" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="col-span-2 text-sm text-muted">Position
              <select className="field mt-0.5 text-ink" value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">All positions</option>
                {Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="col-span-2 text-sm text-muted">Club
              <select className="field mt-0.5 text-ink" value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">All clubs</option>
                {teams.data?.map((t) => <option key={t.team_id} value={t.team_id}>{t.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-muted">Age from
              <input type="number" min={15} max={45} className="field mt-0.5 text-ink" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
            </label>
            <label className="text-sm text-muted">Age to
              <input type="number" min={15} max={45} className="field mt-0.5 text-ink" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} />
            </label>
            <label className="col-span-2 text-sm text-muted">Minimum minutes this season
              <input type="number" min={0} step={90} className="field mt-0.5 text-ink" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 max-h-[26rem] overflow-y-auto pr-1" data-lenis-prevent>
            <DataState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No players fit these filters."><p>Try fewer minutes or a wider age range.</p></EmptyState>}>
              {(data) => (
                <ul>
                  {data.items.map((p) => (
                    <li key={p.player_id}>
                      <button
                        type="button"
                        aria-current={active === p.player_id}
                        onClick={() => setSelected(p.player_id)}
                        className={`chalk flex min-h-11 w-full items-center gap-2 border-b px-1 py-1.5 text-left ${active === p.player_id ? "bg-surface text-accent" : "hover:bg-surface/50"}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="text-sm text-muted">{p.tla}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </DataState>
          </div>
        </section>
        <section aria-label="Player profile" className="min-w-0">
          {active ? <Profile key={active} id={active} /> : <EmptyState title="Pick a player to see their profile." />}
        </section>
      </div>
    </>
  );
}
