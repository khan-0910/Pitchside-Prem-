import { initials } from "@/lib/format";

/** Generic emblem: a shield in a colour derived from the code. Never a club's crest. */
function hue(text: string): number {
  return [...text].reduce((total, c) => (total * 31 + c.charCodeAt(0)) % 360, 7);
}

export function ClubEmblem({ tla, size = 28 }: { tla: string; size?: number }) {
  const h = hue(tla);
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 32 32" className="shrink-0">
      <path d="M16 2 28 6v11c0 7-5 11-12 13C9 28 4 24 4 17V6z" fill={`hsl(${h} 32% 22%)`} stroke={`hsl(${h} 45% 62%)`} strokeWidth="1.5" />
      <text x="16" y="20" textAnchor="middle" fontSize="10" fontWeight="600" fill="#F3F5EF" fontFamily="Barlow, sans-serif">
        {tla}
      </text>
    </svg>
  );
}

export function PlayerAvatar({ name, size = 40, highlight }: { name: string; size?: number; highlight?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full border font-display font-bold ${
        highlight ? "border-volt text-volt" : "chalk bg-deep text-flood"
      }`}
    >
      {initials(name)}
    </span>
  );
}
