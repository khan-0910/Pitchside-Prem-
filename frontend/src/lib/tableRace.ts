import type { StandingRow } from "@/types/api";

export type Race = "ucl" | "uel" | "title" | "europe" | "survival" | "drop";

const UCL_PLACES = 4;
const EUROPE_PLACES = 6;
const DROP_FROM = 18;
const TITLE_GAP = 6;
const RACE_GAP = 3;

export const RACES: { race: Race; label: string }[] = [
  { race: "ucl", label: "Champions League places" },
  { race: "uel", label: "Europa and Conference League places" },
  { race: "title", label: "Title fight, within 6 points of first" },
  { race: "europe", label: "European fight, within 3 points of sixth" },
  { race: "survival", label: "Relegation fight, within 3 points of 18th" },
  { race: "drop", label: "Relegation places" },
];

/** Places are fixed. A fight is a gap in points, so it moves with the table. */
export function raceFor(row: StandingRow, table: StandingRow[]): Race | null {
  const points = (position: number) => table.find((r) => r.position === position)?.points ?? 0;
  if (row.position <= UCL_PLACES) return "ucl";
  if (row.position >= DROP_FROM) return "drop";
  if (row.position <= EUROPE_PLACES) return "uel";
  if (row.points >= points(1) - TITLE_GAP) return "title";
  if (row.points >= points(EUROPE_PLACES) - RACE_GAP) return "europe";
  if (row.points <= points(DROP_FROM) + RACE_GAP) return "survival";
  return null;
}

export const raceLabel = (race: Race | null) => RACES.find((r) => r.race === race)?.label;
