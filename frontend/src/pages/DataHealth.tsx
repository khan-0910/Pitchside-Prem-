import { useQuery } from "@tanstack/react-query";
import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { XCircle } from "@phosphor-icons/react/dist/csr/XCircle";

import { PageTitle } from "@/components/layout/DashboardLayout";
import { DataState, EmptyState } from "@/components/ui/states";
import { StatusPill } from "@/components/ui/StatusPill";
import { day, timeAgo } from "@/lib/format";
import { api } from "@/services/api";

export default function DataHealth() {
  const query = useQuery({ queryKey: ["data-health"], queryFn: api.dataHealth, refetchInterval: 60_000 });
  return (
    <>
      <PageTitle title="Data Health" intro="Where every number comes from, how fresh it is and what is broken." />
      <DataState query={query} isEmpty={(d) => d.sources.length === 0} empty={<EmptyState title="No sources are registered yet." />}>
        {(data) => (
          <div className="space-y-11">
            <section aria-labelledby="sources-h">
              <h2 id="sources-h" className="sr-only">Sources</h2>
              <ul>
                {data.sources.map((s) => (
                  <li key={s.source_id} className="chalk grid gap-x-6 gap-y-1 border-b py-3 md:grid-cols-[minmax(0,1.2fr)_8rem_minmax(0,1fr)]">
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-sm text-muted">{s.description}</p>
                    </div>
                    <StatusPill status={s.status} optional={s.optional} />
                    <div className="text-sm">
                      <p className="num">{s.records.toLocaleString("en-GB")} records</p>
                      <p className="text-muted">Last success {timeAgo(s.last_success_at).toLowerCase()}, tried {timeAgo(s.last_attempt_at).toLowerCase()}</p>
                      {s.coverage && <p className="text-muted">{s.coverage}</p>}
                      {s.data_as_of && <p className="text-muted">Data runs to {day(s.data_as_of)}</p>}
                      {s.upstream_updated_at && <p className="text-muted">Published {day(s.upstream_updated_at)}</p>}
                      {s.last_error && !s.optional && <p className="text-alert">{s.last_error}</p>}
                      {s.note && <p className="mt-1 text-ink">{s.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <div className="grid gap-9 lg:grid-cols-2">
              <section>
                <h2 className="text-lg">Quality checks</h2>
                <ul className="mt-2">
                  {data.quality_checks.map((c) => (
                    <li key={`${c.source_id}-${c.check}`} className="chalk flex items-start gap-2 border-b py-1.5">
                      {c.passed ? <CheckCircle aria-label="Passed" size={18} weight="fill" className="mt-0.5 shrink-0 text-accent" /> : <XCircle aria-label="Failed" size={18} weight="fill" className="mt-0.5 shrink-0 text-alert" />}
                      <span className="min-w-0">
                        {c.check.replaceAll("_", " ")}
                        <span className="block text-sm text-muted">{c.source_id.replaceAll("_", " ")}: {c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <div className="space-y-9">
                <section>
                  <h2 className="text-lg">Failed jobs</h2>
                  {data.failed_runs.length === 0 ? (
                    <p className="text-muted">No failed ingestion jobs recorded.</p>
                  ) : (
                    <ul className="mt-2">
                      {data.failed_runs.slice(0, 8).map((r) => (
                        <li key={`${r.source_id}-${r.at}`} className="chalk border-b py-1.5">
                          {r.source_id.replaceAll("_", " ")} <span className="text-sm text-muted">{timeAgo(r.at).toLowerCase()}</span>
                          <span className="block text-sm text-muted">{r.error}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section>
                  <h2 className="text-lg">Entities awaiting review</h2>
                  {Object.keys(data.unresolved_entities).length === 0 ? (
                    <p className="text-muted">Nothing is waiting for a manual match.</p>
                  ) : (
                    <ul className="mt-1">
                      {Object.entries(data.unresolved_entities).map(([type, count]) => (
                        <li key={type}><span className="num">{count}</span> {type}{count === 1 ? "" : "s"} could not be matched with confidence</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-sm text-muted">Low-confidence matches are never accepted automatically.</p>
                </section>
                <section>
                  <h2 className="text-lg">Model freshness</h2>
                  <ul className="mt-1">
                    {data.models.map((m) => (
                      <li key={m.model_version} className="chalk flex justify-between gap-3 border-b py-1.5">
                        <span className="capitalize">{m.model_type}</span>
                        <span className="text-muted">Trained {timeAgo(m.trained_at).toLowerCase()}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          </div>
        )}
      </DataState>
    </>
  );
}
