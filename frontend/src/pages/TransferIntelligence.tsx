import { useQuery } from "@tanstack/react-query";
import { ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { Clock } from "@phosphor-icons/react/dist/csr/Clock";
import { useDeferredValue, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageTitle } from "@/components/layout/DashboardLayout";
import { DataState, EmptyState, SkeletonRows } from "@/components/ui/states";
import { ValuationScale } from "@/features/transfers/ValuationScale";
import { ASSESSMENT, GROUPS, day, euros, signed } from "@/lib/format";
import { api } from "@/services/api";
import type { Valuation } from "@/types/api";

type Sort = "gap_pct" | "gap_eur" | "actual" | "predicted" | "age" | "name" | "minutes";
const COLUMNS: { key: Sort; label: string; align?: string }[] = [
  { key: "name", label: "Player" },
  { key: "age", label: "Age", align: "text-right" },
  { key: "minutes", label: "Minutes", align: "text-right" },
  { key: "actual", label: "Recorded", align: "text-right" },
  { key: "predicted", label: "Model", align: "text-right" },
  { key: "gap_pct", label: "Gap", align: "text-right" },
];

function History({ id }: { id: string }) {
  const query = useQuery({ queryKey: ["valuation", id], queryFn: () => api.valuation(id) });
  return (
    <DataState query={query} loading={<SkeletonRows rows={3} />}>
      {(data) => (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            {data.estimate && (
              <>
                <ValuationScale
                  actual={data.estimate.actual_eur}
                  predicted={data.estimate.predicted_eur}
                  low={data.estimate.low_eur}
                  high={data.estimate.high_eur}
                  highlight={data.estimate.assessment === "model_undervalued"}
                />
                <p className="mt-3 text-sm text-muted">
                  {ASSESSMENT[data.estimate.assessment]}. Value observed {day(data.estimate.valuation_date)}.
                  {data.estimate.stale_valuation ? " This valuation is old." : ""}
                </p>
              </>
            )}
            <p className="mt-2 text-sm text-muted">{data.note}</p>
          </div>
          {data.history.length > 1 && (
            <figure className="m-0">
              <figcaption className="mb-1 text-sm text-muted">Recorded value over time</figcaption>
              <div className="h-52" aria-hidden>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.history} margin={{ left: 8, right: 8, top: 6 }}>
                    <CartesianGrid stroke="rgb(15 21 18 / 0.08)" vertical={false} />
                    <XAxis dataKey="valuation_date" tick={{ fill: "#5B655F", fontSize: 12 }} tickFormatter={(v: string) => v.slice(0, 4)} minTickGap={36} stroke="none" />
                    <YAxis tick={{ fill: "#5B655F", fontSize: 12 }} tickFormatter={euros} width={58} stroke="none" />
                    <Tooltip
                      contentStyle={{ background: "#FFFFFF", border: "1px solid #D9DED9", borderRadius: 3 }}
                      labelFormatter={(v) => day(String(v))}
                      formatter={(v, _n, item) => [euros(Number(v)), item.payload.club_name ?? "Value"]}
                    />
                    <Line type="stepAfter" dataKey="value_eur" stroke="#0B7A43" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="sr-only">
                Latest recorded value {euros(data.history.at(-1)?.value_eur)} on {day(data.history.at(-1)?.valuation_date)}.
                Highest {euros(Math.max(...data.history.map((h) => h.value_eur)))}.
              </p>
            </figure>
          )}
        </div>
      )}
    </DataState>
  );
}

const gapClass = (v: Valuation) =>
  v.assessment === "model_undervalued" ? "text-accent" : v.assessment === "model_overvalued" ? "text-alert" : "";

export default function TransferIntelligence() {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [team, setTeam] = useState("");
  const [minGap, setMinGap] = useState("");
  const [minutes, setMinutes] = useState("450");
  const [sort, setSort] = useState<Sort>("gap_pct");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [open, setOpen] = useState<string | null>(null);
  const [count, setCount] = useState(40);
  const search = useDeferredValue(q);

  const teams = useQuery({ queryKey: ["teams"], queryFn: api.teams });
  const query = useQuery({
    queryKey: ["values", search, group, team, minGap, minutes, sort, direction, count],
    queryFn: () => api.values({
      q: search, position_group: group, team, min_gap_pct: minGap, min_minutes: minutes, sort, direction, limit: count,
    }),
    placeholderData: (previous) => previous,
  });

  const toggleSort = (key: Sort) => {
    if (sort === key) setDirection(direction === "desc" ? "asc" : "desc");
    else {
      setSort(key);
      setDirection(key === "name" ? "asc" : "desc");
    }
  };

  return (
    <>
      <PageTitle title="Transfer Intelligence" intro="Recorded market value against the model's estimate of the next one. Estimates are not transfer fees." />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className="col-span-2 text-sm text-muted md:col-span-1">Search
          <input type="search" className="field mt-0.5 text-ink" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="text-sm text-muted">Position
          <select className="field mt-0.5 text-ink" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All</option>
            {Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="text-sm text-muted">Club
          <select className="field mt-0.5 text-ink" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">All</option>
            {teams.data?.map((t) => <option key={t.team_id} value={t.team_id}>{t.short_name}</option>)}
          </select>
        </label>
        <label className="text-sm text-muted">Gap at least (%)
          <input type="number" className="field mt-0.5 text-ink" value={minGap} onChange={(e) => setMinGap(e.target.value)} />
        </label>
        <label className="text-sm text-muted">Minutes at least
          <input type="number" min={0} step={90} className="field mt-0.5 text-ink" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
      </div>

      <DataState query={query} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="No players fit these filters" />}>
        {(data) => (
          <>
            <table className="w-full text-left">
              <caption className="sr-only">Player valuations. Column headers sort the table.</caption>
              <thead className="max-md:hidden">
                <tr className="chalk border-b text-sm text-muted">
                  {COLUMNS.map((c) => (
                    <th key={c.key} scope="col" aria-sort={sort === c.key ? (direction === "asc" ? "ascending" : "descending") : "none"} className={`font-normal ${c.align ?? ""}`}>
                      <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex min-h-10 items-center gap-1 hover:text-ink">
                        {c.label}
                        {sort === c.key && (direction === "desc" ? <ArrowDown aria-hidden size={13} /> : <ArrowUp aria-hidden size={13} />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="num max-md:block">
                {data.items.map((v) => (
                  <PlayerRow key={v.player_id} v={v} open={open === v.player_id} onToggle={() => setOpen(open === v.player_id ? null : v.player_id)} />
                ))}
              </tbody>
            </table>
            {data.total > data.items.length && (
              <button type="button" className="btn-ghost mt-4" onClick={() => setCount(count + 40)}>
                Show more ({data.total - data.items.length} left)
              </button>
            )}
            <p className="mt-4 max-w-3xl text-sm text-muted">{data.note} Newest value shown here was observed {day(data.items.map((v) => v.valuation_date).sort().at(-1))}. Clear signals need at least {data.minimum_minutes_for_flag} minutes this season.</p>
          </>
        )}
      </DataState>
    </>
  );
}

function PlayerRow({ v, open, onToggle }: { v: Valuation; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="chalk border-b max-md:grid max-md:grid-cols-[1fr_auto] max-md:gap-x-3 max-md:py-2">
        <td className="py-2 max-md:col-span-2 max-md:py-0">
          <button type="button" aria-expanded={open} onClick={onToggle} className="text-left hover:text-accent">
            <span className="font-medium">{v.name}</span>
            <span className="block text-sm text-muted">
              {v.team_short}
              {v.stale_valuation && <span className="ml-2 inline-flex items-center gap-1 text-amber"><Clock aria-hidden size={12} />Old value</span>}
            </span>
          </button>
        </td>
        <td className="py-2 text-right max-md:hidden">{v.age}</td>
        <td className="py-2 text-right max-md:hidden">{v.minutes?.toFixed(0)}</td>
        <td className="py-2 text-right max-md:py-0 max-md:text-left"><span className="text-sm text-muted md:hidden">Recorded </span>{euros(v.actual_eur)}</td>
        <td className="py-2 text-right max-md:hidden">{euros(v.predicted_eur)}</td>
        <td className={`py-2 text-right max-md:py-0 ${gapClass(v)}`}>{signed(v.gap_pct, 1)}%</td>
      </tr>
      {open && (
        <tr className="max-md:block">
          <td colSpan={6} className="bg-surface/60 p-4 max-md:block"><History id={v.player_id} /></td>
        </tr>
      )}
    </>
  );
}
