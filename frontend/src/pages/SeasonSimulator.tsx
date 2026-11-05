import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";

import { useReducedMotion } from "@/animations/useReducedMotion";
import { PageTitle } from "@/components/layout/DashboardLayout";
import { Ball, Trophy, Trophy as TrophyIcon } from "@/components/football/icons";
import { BallLoader } from "@/components/football/BallLoader";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ClubEmblem } from "@/components/ui/identity";
import { DataState, EmptyState, ErrorState } from "@/components/ui/states";
import { day, percent } from "@/lib/format";
import { api } from "@/services/api";
import { useUi } from "@/stores/ui";
import type { Simulation, SimulationRow } from "@/types/api";

function Bars({ rows, pick, title, color }: { rows: SimulationRow[]; pick: (r: SimulationRow) => number; title: string; color: string }) {
  const shown = [...rows].filter((r) => pick(r) >= 0.005).sort((a, b) => pick(b) - pick(a)).slice(0, 8);
  const top = Math.max(...shown.map(pick), 0.01);
  return (
    <section>
      <h2 className="text-2xl">{title}</h2>
      {shown.length === 0 && <p className="text-muted">No club reaches 1% in this run.</p>}
      <ul className="mt-2 space-y-1.5">
        {shown.map((r) => (
          <li key={r.team_id} className="grid grid-cols-[6.5rem_1fr_3.2rem] items-center gap-2 text-sm">
            <span className="truncate">{r.short_name}</span>
            <span aria-hidden className="h-2.5 pr-3">
              <motion.span layout className="relative block h-full rounded-r-[4px]" style={{ width: `${(pick(r) / top) * 100}%`, background: color }}>
                <motion.span className="absolute -right-2 -top-[4px] block" initial={{ rotate: -720 }} animate={{ rotate: 0 }} transition={{ duration: 1 }}>
                  <Ball size={18} />
                </motion.span>
              </motion.span>
            </span>
            <span className="num text-right">{percent(pick(r), 1)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Distribution({ rows }: { rows: SimulationRow[] }) {
  const teams = rows.length;
  return (
    <section className="min-w-0">
      <h2 className="text-2xl">Finishing position chances</h2>
      <p className="text-sm text-muted">Each row adds up to 100%. Darker means less likely.</p>
      <div className="mt-2 overflow-x-auto" data-lenis-prevent-horizontal>
        <table className="w-full min-w-[42rem] border-separate border-spacing-px text-xs">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Club</span></th>
              {Array.from({ length: teams }, (_, i) => <th key={i} scope="col" className="num font-normal text-muted">{i + 1}</th>)}
            </tr>
          </thead>
          <tbody className="num">
            {rows.map((r) => (
              <tr key={r.team_id}>
                <th scope="row" className="whitespace-nowrap pr-2 text-left font-normal">{r.short_name}</th>
                {r.position_distribution.map((p, i) => (
                  <td
                    key={i}
                    title={`${r.short_name} finishing ${i + 1}: ${percent(p, 1)}`}
                    className="h-6 text-center"
                    style={{ background: `rgb(184 255 84 / ${Math.min(p * 2.4, 0.95).toFixed(2)})`, color: p > 0.2 ? "#071511" : "transparent" }}
                  >
                    {p > 0.2 ? Math.round(p * 100) : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FinalTable({ sim, previous }: { sim: Simulation; previous: Map<string, number> }) {
  const reduced = useReducedMotion();
  return (
    <table className="w-full text-left">
      <caption className="sr-only">Projected final table from {sim.iterations} simulated seasons</caption>
      <thead>
        <tr className="chalk border-b text-sm text-muted">
          <th scope="col" className="py-1.5 font-normal">Club</th>
          <th scope="col" className="py-1.5 text-right font-normal max-sm:hidden">Now</th>
          <th scope="col" className="py-1.5 text-right font-normal">Points</th>
          <th scope="col" className="py-1.5 text-right font-normal max-md:hidden">10-90% range</th>
          <th scope="col" className="py-1.5 text-right font-normal max-sm:hidden">Position</th>
          <th scope="col" className="py-1.5 text-right font-normal">Title</th>
          <th scope="col" className="py-1.5 text-right font-normal max-sm:hidden">Top 4</th>
          <th scope="col" className="py-1.5 text-right font-normal max-lg:hidden">Top 6</th>
          <th scope="col" className="py-1.5 text-right font-normal">Down</th>
        </tr>
      </thead>
      <tbody className="num">
        <AnimatePresence initial={false}>
          {sim.results.map((r, i) => {
            const before = previous.get(r.team_id);
            const moved = before !== undefined ? before - i : 0;
            return (
              <motion.tr
                layout={!reduced}
                key={r.team_id}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: reduced ? 0 : i * 0.025 }}
                className="chalk border-b"
              >
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-muted">{i + 1}</span>
                    <ClubEmblem tla={r.tla} size={22} />
                    <span className="min-w-0 max-w-28 truncate">{r.short_name}</span>
                    {i === 0 && <motion.span className="text-gold" initial={reduced ? false : { y: -14, scale: 0 }} animate={{ y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 9 }}><TrophyIcon size={18} /></motion.span>}
                    {moved !== 0 && <span className={`text-sm max-sm:hidden ${moved > 0 ? "text-volt" : "text-muted"}`}>{moved > 0 ? `up ${moved}` : `down ${-moved}`}</span>}
                  </span>
                </td>
                <td className="py-1.5 text-right text-muted max-sm:hidden">{r.current_points}</td>
                <td className="py-1.5 text-right">{r.expected_points.toFixed(1)}</td>
                <td className="py-1.5 text-right text-muted max-md:hidden">{r.points_p10.toFixed(0)} to {r.points_p90.toFixed(0)}</td>
                <td className="py-1.5 text-right max-sm:hidden">{r.expected_position.toFixed(1)}</td>
                <td className={`py-1.5 text-right ${r.p_title >= 0.1 ? "text-gold" : ""}`}>{percent(r.p_title, 1)}</td>
                <td className="py-1.5 text-right max-sm:hidden">{percent(r.p_top4)}</td>
                <td className="py-1.5 text-right max-lg:hidden">{percent(r.p_top6)}</td>
                <td className="py-1.5 text-right">{percent(r.p_relegation, 1)}</td>
              </motion.tr>
            );
          })}
        </AnimatePresence>
      </tbody>
    </table>
  );
}

export default function SeasonSimulator() {
  const client = useQueryClient();
  const defaults = useUi((s) => s.defaultIterations);
  const [iterations, setIterations] = useState(defaults);
  const [seed, setSeed] = useState(2026);
  const [viewing, setViewing] = useState<string | null>(null);
  const previous = useRef(new Map<string, number>());

  const latest = useQuery({ queryKey: ["simulation", "latest"], queryFn: api.latestSimulation, retry: false });
  const picked = useQuery({ queryKey: ["simulation", viewing], queryFn: () => api.simulation(viewing!), enabled: Boolean(viewing) });
  const history = useQuery({ queryKey: ["simulation", "history"], queryFn: api.simulationHistory });

  const shown = viewing ? picked.data : latest.data;

  const run = useMutation({
    mutationFn: () => api.runSimulation(iterations, seed),
    onMutate: () => {
      previous.current = new Map(shown?.results.map((r, i) => [r.team_id, i]));
    },
    onSuccess: (result) => {
      setViewing(null);
      client.setQueryData(["simulation", "latest"], result);
      client.invalidateQueries({ queryKey: ["simulation", "history"] });
    },
  });

  const valid = Number.isInteger(iterations) && iterations >= 100 && iterations <= 50_000;

  return (
    <>
      <PageTitle icon={Trophy} title="Season Simulator" intro="Plays every remaining fixture thousands of times, keeping the real results so far." />
      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) run.mutate();
        }}
      >
        <label className="text-sm text-muted">Seasons to simulate
          <input type="number" min={100} max={50000} step={100} required className="field mt-0.5 !w-36 text-flood" value={iterations} onChange={(e) => setIterations(Number(e.target.value))} />
        </label>
        <label className="text-sm text-muted">Random seed
          <input type="number" min={0} className="field mt-0.5 !w-28 text-flood" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
        <button type="submit" className="btn-primary" disabled={run.isPending || !valid}>
          {run.isPending ? "Simulating" : "Run simulation"}
        </button>
        {!valid && <p role="alert" className="w-full text-sm text-alert">Choose between 100 and 50,000 seasons.</p>}
      </form>

      <div className="min-h-2" aria-live="polite">
        {run.isPending && (
          <div role="status" className="mb-4">
            <p className="text-sm text-muted">Running {iterations.toLocaleString("en-GB")} seasons on the server</p>
            <BallLoader label="Simulating" />
          </div>
        )}
        {run.isError && <div className="mb-4"><ErrorState error={run.error} onRetry={() => run.mutate()} /></div>}
      </div>

      {shown ? (
        <div className="space-y-9">
          <dl className="flex flex-wrap gap-x-10 gap-y-2">
            <div>
              <dt className="text-sm text-muted">Simulated seasons</dt>
              <dd className="font-display text-4xl font-black"><AnimatedNumber value={shown.iterations} format={(v) => Math.round(v).toLocaleString("en-GB")} /></dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Fixtures left</dt>
              <dd className="font-display text-4xl font-black"><AnimatedNumber value={shown.fixtures_remaining} /></dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Largest sampling error</dt>
              <dd className="num font-display text-4xl font-black">±{percent(shown.max_standard_error, 1)}</dd>
            </div>
          </dl>
          <FinalTable sim={shown} previous={previous.current} />
          <p className="max-w-3xl text-sm text-muted">{shown.note} Seed {shown.seed}, model {shown.model_version}, run {day(shown.created_at)}.</p>
          <div className="grid gap-8 md:grid-cols-2">
            <Bars rows={shown.results} pick={(r) => r.p_title} title="Title chance" color="#D6AD56" />
            <Bars rows={shown.results} pick={(r) => r.p_top4} title="Top-four chance" color="#B8FF54" />
          </div>
          <Distribution rows={shown.results} />
        </div>
      ) : latest.isPending ? (
        <div className="skeleton h-96 w-full" />
      ) : (
        <EmptyState title="No simulation has been run yet."><p>Press Run simulation to start one.</p></EmptyState>
      )}

      <section className="mt-9">
        <h2 className="text-2xl">Earlier runs</h2>
        <DataState query={history} isEmpty={(d) => d.length === 0} empty={<EmptyState title="Runs you start will be listed here." />}>
          {(rows) => (
            <ul className="mt-2">
              {rows.map((r) => (
                <li key={r.simulation_id} className="chalk border-b">
                  <button type="button" onClick={() => setViewing(r.simulation_id)} className="grid min-h-11 w-full grid-cols-2 items-center gap-x-4 py-1.5 text-left hover:bg-deep/40 md:grid-cols-4">
                    <span>{day(r.created_at)}</span>
                    <span className="num text-muted">{r.iterations.toLocaleString("en-GB")} seasons, seed {r.seed}</span>
                    <span>{r.title_favourite} {percent(r.p_title)}</span>
                    <span className="text-sm text-muted">{r.fixtures_remaining} fixtures left</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </section>
    </>
  );
}
