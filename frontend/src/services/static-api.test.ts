import { filterFixtures, filterPlayers, filterValues } from "@/services/static-api";
import type { Fixture, PlayerSummary, Valuation } from "@/types/api";

const player = (over: Partial<PlayerSummary>) => ({ name: "A", team_id: "ars", position_group: "W", age: 25, minutes: 900, xg: 1, ...over }) as PlayerSummary;

describe("static filters match the API", () => {
  it("finds names without accents and keeps missing values last", () => {
    const rows = [player({ name: "Martin Ødegaard" }), player({ name: "Pelé", xg: null }), player({ name: "Mo", xg: 5 })];
    expect(filterPlayers(rows, { q: "pele" }).items).toHaveLength(1);
    expect(filterPlayers(rows, { sort: "xg" }).items.map((p) => p.name)).toEqual(["Mo", "Martin Ødegaard", "Pelé"]);
  });

  it("filters by age, minutes and page size, and reports the full total", () => {
    const rows = [player({ age: 19 }), player({ age: 30 }), player({ age: 22, minutes: 10 })];
    const result = filterPlayers(rows, { age_max: 25, min_minutes: 450 });
    expect(result.total).toBe(1);
    expect(filterPlayers(rows, { limit: 1 }).items).toHaveLength(1);
    expect(filterPlayers(rows, { limit: 1 }).total).toBe(3);
  });

  it("sorts valuations both ways and applies the gap floor", () => {
    const rows = [{ ...player({}), gap_pct: 5 }, { ...player({}), gap_pct: 40 }] as unknown as Valuation[];
    expect(filterValues(rows, {}).items[0].gap_pct).toBe(40);
    expect(filterValues(rows, { direction: "asc" }).items[0].gap_pct).toBe(5);
    expect(filterValues(rows, { min_gap_pct: 10 }).total).toBe(1);
  });

  it("filters fixtures by status, club and date", () => {
    const rows = [
      { status: "SCHEDULED", home_team_id: "ars", away_team_id: "che", match_date: "2026-11-08", kickoff_utc: "2026-11-08T15:00:00Z" },
      { status: "FINISHED", home_team_id: "lee", away_team_id: "ars", match_date: "2026-11-01", kickoff_utc: "2026-11-01T15:00:00Z" },
    ] as Fixture[];
    expect(filterFixtures(rows, { team: "ars", status: "FINISHED" }).total).toBe(1);
    expect(filterFixtures(rows, { date_from: "2026-11-02" }).items[0].home_team_id).toBe("ars");
    expect(filterFixtures(rows, { sort: "desc" }).items[0].status).toBe("SCHEDULED");
  });
});
