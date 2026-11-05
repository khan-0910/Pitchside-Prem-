import type { Fixture, Prediction } from "@/types/api";

/** Test shapes only. The app never renders these outside Vitest. */
export const prediction: Prediction = {
  probabilities: { home_win: 0.52, draw: 0.26, away_win: 0.22 },
  expected_goals: { home: 1.7, away: 0.9, total: 2.6 },
  most_likely_score: "1-0",
  score_matrix: [[0.1, 0.05], [0.12, 0.06]],
  confidence: { score: 0.1, label: "Medium" },
  model_version: "match-test",
  predicted_at: "2026-11-05T10:00:00Z",
  data_timestamp: "2026-11-05T09:00:00Z",
  limitations: ["Test limitation"],
};

export const fixture: Fixture = {
  fixture_id: "2026-27:arsenal:everton",
  season_id: "2026-27",
  matchday: 10,
  kickoff_utc: "2026-11-07T15:00:00Z",
  match_date: "2026-11-07",
  status: "SCHEDULED",
  home_team_id: "arsenal",
  home_team: "Arsenal",
  home_short: "Arsenal",
  home_tla: "ARS",
  away_team_id: "everton",
  away_team: "Everton",
  away_short: "Everton",
  away_tla: "EVE",
  home_goals: null,
  away_goals: null,
  prediction,
};

export function mockApi(routes: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = input.replace("/api/v1", "").split("?")[0];
    const key = Object.keys(routes).sort((a, b) => b.length - a.length).find((route) => path.startsWith(route));
    if (key === undefined) {
      return new Response(JSON.stringify({ error: { code: "not_found", message: `No mock for ${path}` } }), { status: 404 });
    }
    const body = routes[key];
    const value = typeof body === "function" ? body(input, init) : body;
    return new Response(JSON.stringify(value), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
