export function euros(value: number | null | undefined): string {
  if (value === null || value === undefined) return "No value";
  const size = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (size >= 1e9) return `${sign}€${(size / 1e9).toFixed(2)}bn`;
  if (size >= 1e6) return `${sign}€${(size / 1e6).toFixed(1)}m`;
  if (size >= 1e3) return `${sign}€${Math.round(size / 1e3)}k`;
  return `${sign}€${Math.round(size)}`;
}

export const percent = (value: number, digits = 0) => `${(value * 100).toFixed(digits)}%`;

export const signed = (value: number, digits = 1) => `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const kickoffFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const day = (value: string | null | undefined) => (value ? dayFormat.format(new Date(value)) : "Date to be set");
export const kickoff = (value: string | null | undefined) => (value ? kickoffFormat.format(new Date(value)) : "Date to be set");

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "Never";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export const initials = (name: string) =>
  name
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const GROUPS: Record<string, string> = {
  GK: "Goalkeepers",
  CB: "Centre-backs",
  FB: "Full-backs",
  DM: "Defensive midfielders",
  CM: "Central midfielders",
  AM: "Attacking midfielders",
  W: "Wingers",
  ST: "Strikers",
};

export const AVAILABILITY: Record<string, string> = {
  a: "Available",
  d: "Doubtful",
  i: "Injured",
  s: "Suspended",
  u: "Unavailable",
  n: "Not in squad",
};
