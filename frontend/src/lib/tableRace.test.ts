import { raceFor } from "@/lib/tableRace";
import type { StandingRow } from "@/types/api";

const POINTS = [30, 28, 27, 26, 25, 24, 24, 22, 21, 18, 17, 15, 14, 13, 12, 12, 11, 10, 8, 5];
const table = POINTS.map((points, i) => ({ position: i + 1, points })) as StandingRow[];
const race = (position: number) => raceFor(table[position - 1], table);

describe("league table races", () => {
  it("colours fixed places by position", () => {
    expect([1, 4].map(race)).toEqual(["ucl", "ucl"]);
    expect([5, 6].map(race)).toEqual(["uel", "uel"]);
    expect([18, 20].map(race)).toEqual(["drop", "drop"]);
  });

  it("marks fights by the gap in points", () => {
    expect(race(7)).toBe("title");
    expect(race(8)).toBe("europe");
    expect(race(10)).toBeNull();
    expect(race(15)).toBe("survival");
  });
});
