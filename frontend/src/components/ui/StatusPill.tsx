import type { SourceStatus } from "@/types/api";

const STYLE: Record<SourceStatus, { dot: string; text: string; label: string }> = {
  LIVE: { dot: "bg-accent", text: "text-accent", label: "Live" },
  CACHED: { dot: "bg-[#f0b400]", text: "text-gold", label: "Cached" },
  STALE: { dot: "bg-[#f08c00]", text: "text-amber", label: "Stale" },
  UNAVAILABLE: { dot: "bg-alert", text: "text-alert", label: "Unavailable" },
};

export function StatusPill({ status, optional }: { status: SourceStatus; optional?: boolean }) {
  // An optional source being away is not an emergency, so it does not get the red.
  const style = optional && status === "UNAVAILABLE" ? { dot: "bg-muted", text: "text-muted", label: "Offline" } : STYLE[status];
  return (
    <span className={`inline-flex items-center gap-2 font-medium ${style.text}`}>
      <span aria-hidden className={`size-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
