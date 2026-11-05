import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

import { PageTitle } from "@/components/layout/DashboardLayout";
import { DataState, EmptyState } from "@/components/ui/states";
import { day, euros, percent } from "@/lib/format";
import { api } from "@/services/api";
import type { BacktestRow, ModelInfo } from "@/types/api";

const TOOLTIP = { contentStyle: { background: "#0B2018", border: "1px solid #174D35", borderRadius: 3 } };
const AXIS = { tick: { fill: "#929B95", fontSize: 12 }, stroke: "none" };
const MODEL = "#B8FF54";
const MARKET = "#D6AD56";
const BASE = "#7FB7FF";

function Facts({ m }: { m: ModelInfo }) {
  const periods = m.reports.periods as Record<string, [string, string]> | undefined;
  const rows: [string, string][] = [
    ["Version", m.model_version],
    ["Method", m.algorithm.replaceAll("_", " ")],
    ["Trained", day(m.trained_at)],
  ];
  if (periods) {
    rows.push(["Training period", `${day(periods.train[0])} to ${day(periods.train[1])}`]);
    rows.push(["Validation period", `${day(periods.validation[0])} to ${day(periods.validation[1])}`]);
    rows.push(["Test period", `${day(periods.test[0])} to ${day(periods.test[1])}`]);
  }
  if (m.n_test) rows.push(["Test sample", m.n_test.toLocaleString("en-GB")]);
  return (
    <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-sm text-muted">{k}</dt>
          <dd className="num">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function MatchTable({ m }: { m: ModelInfo }) {
  const test = m.metrics.test ?? {};
  const rows = [
    { name: "Pitchside, all test matches", s: test.model },
    { name: "Bookmakers, closing prices", s: test.bookmaker_closing },
    { name: "Bookmakers, earlier prices", s: test.bookmaker_pre_match },
    { name: "Historical frequencies", s: test.baseline_frequency },
  ].filter((r) => r.s);
  const validation = Object.entries(m.metrics.validation ?? {}).sort((a, b) => a[1].log_loss - b[1].log_loss);
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <h3 className="text-2xl">Test results</h3>
        <table className="mt-1 w-full text-left">
          <thead>
            <tr className="chalk border-b text-sm text-muted">
              <th scope="col" className="py-1.5 font-normal">Forecast</th>
              <th scope="col" className="py-1.5 text-right font-normal">Log loss</th>
              <th scope="col" className="py-1.5 text-right font-normal">Brier</th>
              <th scope="col" className="py-1.5 text-right font-normal">Accuracy</th>
            </tr>
          </thead>
          <tbody className="num">
            {rows.map((r, i) => (
              <tr key={r.name} className={`chalk border-b ${i === 0 ? "text-volt" : ""}`}>
                <td className="py-1.5">{r.name}</td>
                <td className="py-1.5 text-right">{r.s.log_loss.toFixed(3)}</td>
                <td className="py-1.5 text-right">{r.s.brier.toFixed(3)}</td>
                <td className="py-1.5 text-right">{percent(r.s.accuracy, 1)}</td>
              </tr>
            ))}
            {test.baseline_always_home && (
              <tr className="chalk border-b">
                <td className="py-1.5">Always pick the home win</td>
                <td className="py-1.5 text-right text-muted">n/a</td>
                <td className="py-1.5 text-right text-muted">n/a</td>
                <td className="py-1.5 text-right">{percent(test.baseline_always_home.accuracy, 1)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-2 text-sm text-muted">
          Lower log loss and Brier scores are better. Bookmaker prices have their margin removed and are compared on the same matches.
          {test.expected_goals && ` Expected goals error: ${test.expected_goals.mae_home.toFixed(3)} home and ${test.expected_goals.mae_away.toFixed(3)} away per match, against ${test.expected_goals.baseline_mae_home.toFixed(3)} and ${test.expected_goals.baseline_mae_away.toFixed(3)} from league averages.`}
        </p>
      </div>
      <div>
        <h3 className="text-2xl">Model selection</h3>
        <table className="mt-1 w-full text-left">
          <thead>
            <tr className="chalk border-b text-sm text-muted">
              <th scope="col" className="py-1.5 font-normal">Candidate, on validation seasons</th>
              <th scope="col" className="py-1.5 text-right font-normal">Log loss</th>
            </tr>
          </thead>
          <tbody className="num">
            {validation.map(([name, s], i) => (
              <tr key={name} className="chalk border-b">
                <td className="py-1.5">{name.replaceAll("_", " ")}{i === 0 ? " (chosen)" : ""}</td>
                <td className="py-1.5 text-right">{s.log_loss.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Backtest({ rows }: { rows: BacktestRow[] }) {
  return (
    <figure className="m-0">
      <h3 className="text-2xl">Walk-forward backtest</h3>
      <figcaption className="text-sm text-muted">Refitted before each season, then scored on it. Lower is better. The newest season is partial.</figcaption>
      <div className="mt-2 h-72" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: 0, right: 12, top: 8 }}>
            <CartesianGrid stroke="rgb(243 245 239 / 0.08)" vertical={false} />
            <XAxis dataKey="season" {...AXIS} />
            <YAxis domain={["auto", "auto"]} width={46} {...AXIS} tickFormatter={(v: number) => v.toFixed(2)} />
            <Tooltip {...TOOLTIP} formatter={(v) => Number(v).toFixed(3)} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Line name="Pitchside" dataKey="model_log_loss" stroke={MODEL} strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
            <Line name="Bookmakers" dataKey="market_log_loss" stroke={MARKET} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4 }} isAnimationActive={false} />
            <Line name="Historical frequencies" dataKey="baseline_log_loss" stroke={BASE} strokeWidth={2} strokeDasharray="2 3" dot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-muted">Show as a table</summary>
        <table className="mt-1 w-full text-left text-sm">
          <thead><tr className="chalk border-b text-muted"><th scope="col" className="font-normal">Season</th><th scope="col" className="text-right font-normal">Matches</th><th scope="col" className="text-right font-normal">Pitchside</th><th scope="col" className="text-right font-normal">Bookmakers</th><th scope="col" className="text-right font-normal">Frequencies</th></tr></thead>
          <tbody className="num">
            {rows.map((r) => (
              <tr key={r.season} className="chalk border-b"><td>{r.season}</td><td className="text-right">{r.n}</td><td className="text-right">{r.model_log_loss.toFixed(3)}</td><td className="text-right">{r.market_log_loss?.toFixed(3) ?? "n/a"}</td><td className="text-right">{r.baseline_log_loss.toFixed(3)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Calibration({ data }: { data: Record<string, { predicted: number; observed: number; n: number }[]> }) {
  const series = [
    { key: "home", name: "Home win", color: MODEL, shape: "circle" as const },
    { key: "draw", name: "Draw", color: MARKET, shape: "square" as const },
    { key: "away", name: "Away win", color: BASE, shape: "triangle" as const },
  ];
  return (
    <figure className="m-0">
      <h3 className="text-2xl">Calibration</h3>
      <figcaption className="text-sm text-muted">Points near the diagonal mean a stated 40% really happens about 40% of the time.</figcaption>
      <div className="mt-2 h-72" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ left: 0, right: 12, top: 8 }}>
            <CartesianGrid stroke="rgb(243 245 239 / 0.08)" />
            <XAxis type="number" dataKey="predicted" name="Predicted" domain={[0, 0.8]} {...AXIS} tickFormatter={(v: number) => percent(v)} />
            <YAxis type="number" dataKey="observed" name="Observed" domain={[0, 0.8]} width={46} {...AXIS} tickFormatter={(v: number) => percent(v)} />
            <ZAxis range={[60, 60]} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 0.8, y: 0.8 }]} stroke="#929B95" strokeDasharray="4 4" />
            <Tooltip {...TOOLTIP} formatter={(v) => percent(Number(v), 1)} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            {series.map((s) => <Scatter key={s.key} name={s.name} data={data[s.key]} fill={s.color} shape={s.shape} isAnimationActive={false} />)}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function Confusion({ matrix }: { matrix: number[][] }) {
  const labels = ["Home win", "Draw", "Away win"];
  const top = Math.max(...matrix.flat());
  return (
    <div>
      <h3 className="text-2xl">Confusion matrix</h3>
      <table className="mt-2 border-separate border-spacing-0.5">
        <caption className="mb-1 text-left text-sm text-muted">Rows show what happened. Columns show the model's top pick.</caption>
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">Actual</span></th>
            {labels.map((l) => <th key={l} scope="col" className="px-2 text-sm font-normal text-muted">{l}</th>)}
          </tr>
        </thead>
        <tbody className="num">
          {matrix.map((row, i) => (
            <tr key={labels[i]}>
              <th scope="row" className="pr-2 text-left text-sm font-normal text-muted">{labels[i]}</th>
              {row.map((v, j) => (
                <td key={j} className="h-12 w-20 text-center" style={{ background: `rgb(184 255 84 / ${(v / top * 0.8 + 0.04).toFixed(2)})`, color: v / top > 0.55 ? "#071511" : "#F3F5EF" }}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SliceTable({ title, rows }: { title: string; rows: { slice: string; mae_eur: number; median_ae_eur: number; n: number }[] }) {
  return (
    <div>
      <h3 className="text-2xl">{title}</h3>
      <table className="mt-1 w-full text-left">
        <thead><tr className="chalk border-b text-sm text-muted"><th scope="col" className="py-1 font-normal">Slice</th><th scope="col" className="py-1 text-right font-normal">Mean error</th><th scope="col" className="py-1 text-right font-normal">Median error</th><th scope="col" className="py-1 text-right font-normal">Sample</th></tr></thead>
        <tbody className="num">
          {rows.map((r) => (
            <tr key={r.slice} className="chalk border-b"><td className="py-1">{r.slice}</td><td className="py-1 text-right">{euros(r.mae_eur)}</td><td className="py-1 text-right">{euros(r.median_ae_eur)}</td><td className="py-1 text-right">{r.n}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Transfer({ m }: { m: ModelInfo }) {
  const test = m.metrics.test ?? {};
  const rows = [["This model", test.model], ["No change from last value", test.baseline_no_change], ["Performance only, no value history", test.performance_only]] as const;
  const slices = m.reports.slices as { by_position: never[]; by_value_band: never[] } | undefined;
  return (
    <>
      <Facts m={m} />
      <table className="mt-5 w-full text-left">
        <thead><tr className="chalk border-b text-sm text-muted"><th scope="col" className="py-1.5 font-normal">Estimate</th><th scope="col" className="py-1.5 text-right font-normal">Mean error</th><th scope="col" className="py-1.5 text-right font-normal max-sm:hidden">RMSE</th><th scope="col" className="py-1.5 text-right font-normal">Median error</th><th scope="col" className="py-1.5 text-right font-normal">R², log scale</th></tr></thead>
        <tbody className="num">
          {rows.filter(([, s]) => s).map(([name, s], i) => (
            <tr key={name} className={`chalk border-b ${i === 0 ? "text-volt" : ""}`}>
              <td className="py-1.5">{name}</td>
              <td className="py-1.5 text-right">{euros(s.mae_eur)}</td>
              <td className="py-1.5 text-right max-sm:hidden">{euros(s.rmse_eur)}</td>
              <td className="py-1.5 text-right">{euros(s.median_ae_eur)}</td>
              <td className="py-1.5 text-right">{s.r2_log.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {test.model?.interval_coverage_80 !== undefined && (
        <p className="mt-2 text-sm text-muted">The model's 80% range contained the real value {percent(test.model.interval_coverage_80, 1)} of the time in testing.</p>
      )}
      {slices && (
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <SliceTable title="Error by position" rows={slices.by_position} />
          <SliceTable title="Error by value" rows={slices.by_value_band} />
        </div>
      )}
    </>
  );
}

function Similarity({ m }: { m: ModelInfo }) {
  const fit = m.metrics.fit?.model ?? {};
  return (
    <>
      <Facts m={m} />
      <p className="mt-4 max-w-3xl">
        Using this season alone, the model puts the same player's last-season profile in its top 10 for {percent(fit.top10_retrieval ?? 0, 1)} of {fit.players_tested ?? 0} players tested.
        Random picks would manage {percent(fit.random_top10_rate ?? 0, 1)}. Profiles cover {fit.players} players with at least {fit.min_minutes} weighted minutes.
      </p>
      <p className="mt-2 text-sm text-muted">FPL publishes no shots, key passes, progressive passes, dribbles or aerial duels, so those are not in the profiles.</p>
    </>
  );
}

const LIMITS = [
  "The match model has no tactics, confirmed line-ups or manager changes.",
  "Team xG is only available from 2026-27, so it is not yet a training feature.",
  "Squad strength for live fixtures uses FPL minutes and availability. History uses Transfermarkt appearances.",
  "Simulations hold team strength fixed across a run, so the true spread is probably wider.",
  "Valuations come from a third-party dump that lags the live site.",
];

export default function ModelPerformance() {
  const query = useQuery({ queryKey: ["model-metrics"], queryFn: api.modelMetrics });
  return (
    <>
      <PageTitle title="Model Performance" intro="How each model was built and how it scored on data it had never seen." />
      <DataState query={query} isEmpty={(d) => !d.match && !d.transfer && !d.similarity} empty={<EmptyState title="No models have been trained yet." />}>
        {(data) => (
          <div className="space-y-14">
            {data.match && (
              <section className="space-y-7">
                <h2 className="text-4xl">Match predictor</h2>
                <Facts m={data.match} />
                <MatchTable m={data.match} />
                <Backtest rows={data.match.reports.backtest as BacktestRow[]} />
                <div className="grid gap-8 lg:grid-cols-2">
                  <Calibration data={data.match.reports.calibration as never} />
                  <Confusion matrix={data.match.reports.confusion as number[][]} />
                </div>
              </section>
            )}
            {data.similarity && <section><h2 className="mb-4 text-4xl">Player similarity</h2><Similarity m={data.similarity} /></section>}
            {data.transfer && <section><h2 className="mb-4 text-4xl">Transfer value</h2><Transfer m={data.transfer} /></section>}
            <section>
              <h2 className="text-4xl">Limitations</h2>
              <ul className="mt-2 max-w-3xl list-disc space-y-1 pl-5">{LIMITS.map((l) => <li key={l}>{l}</li>)}</ul>
              <p className="mt-4 max-w-3xl text-muted">{(data.match ?? data.transfer ?? data.similarity)?.disclaimer}</p>
            </section>
          </div>
        )}
      </DataState>
    </>
  );
}
