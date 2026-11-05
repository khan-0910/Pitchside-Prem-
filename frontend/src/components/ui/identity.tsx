import { clubColours } from "@/lib/clubs";
import { initials } from "@/lib/format";

/** A two-colour disc in the club's shirt colours. Never a crest. */
export function ClubEmblem({ tla, size = 22 }: { tla: string; size?: number }) {
  const [main, second] = clubColours(tla);
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <circle cx="12" cy="12" r="11.25" fill={second} stroke="rgb(15 21 18 / 0.16)" strokeWidth="1.5" />
      <path d="M12 .75a11.25 11.25 0 0 0 0 22.5z" fill={main} />
    </svg>
  );
}

export function PlayerAvatar({ name, size = 40, highlight }: { name: string; size?: number; highlight?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${
        highlight ? "bg-accent text-accent-ink" : "bg-sunken text-ink"
      }`}
    >
      {initials(name)}
    </span>
  );
}
