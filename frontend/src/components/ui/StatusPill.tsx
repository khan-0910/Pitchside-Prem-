import type { SourceStatus } from "@/types/api";

const STYLE: Record<SourceStatus, { dot: string; text: string; label: string }> = {
  LIVE: { dot: "bg-volt", text: "text-volt", label: "Live" },
  CACHED: { dot: "bg-gold", text: "text-gold", label: "Cached" },
  STALE: { dot: "bg-amber", text: "text-amber", label: "Stale" },
  UNAVAILABLE: { dot: "bg-alert", text: "text-alert", label: "Unavailable" },
};

export function StatusPill({ status }: { status: SourceStatus }) {
  const style = STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${style.text}`}>
      <span aria-hidden className={`size-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
