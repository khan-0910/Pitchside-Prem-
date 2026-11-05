import { ApiError, type Api } from "@/services/api";
import type {
  Comparison,
  DataHealth,
  DataSource,
  Fixture,
  ModelInfo,
  ModelMetrics,
  Page,
  PlayerDetail,
  PlayerSummary,
  SimilarResponse,
  Simulation,
  SimulationSummary,
  SquadView,
  Standings,
  Team,
  TeamForm,
  TeamNews,
  Undervalued,
  Valuation,
  ValuationDetail,
  ValuationPage,
  WhatIfScenario,
} from "@/types/api";

/** The public site has no server, so it reads files that the API wrote at publish time. */
type Query = Record<string, string | number | boolean | null | undefined>;

const NEEDS_SERVER = "This needs the full app. The public site is a snapshot and cannot run new calculations.";
const files = new Map<string, Promise<unknown>>();

function file<T>(name: string): Promise<T> {
  if (!files.has(name)) {
    const load = fetch(`${import.meta.env.BASE_URL}snapshot/${name}.json`).then((response) => {
      if (!response.ok) throw new ApiError("This isn't in the public snapshot.", response.status, "not_found");
      return response.json();
    });
    files.set(name, load);
  }
  return files.get(name) as Promise<T>;
}

const fold = (text: string) => text.toLowerCase().replace(/ø/g, "o").normalize("NFD").replace(/\p{M}/gu, "");
const num = (value: Query[string]) => (value === undefined || value === null || value === "" ? null : Number(value));

function page<T>(rows: T[], q: Query): Page<T> {
  const limit = num(q.limit) ?? 50;
  const offset = num(q.offset) ?? 0;
  return { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset };
}

function sortBy<T>(rows: T[], key: (row: T) => string | number | null, descending: boolean): T[] {
  return [...rows].sort((x, y) => {
    const a = key(x);
    const b = key(y);
    if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
    const order = typeof a === "string" ? a.localeCompare(String(b)) : a - Number(b);
    return descending ? -order : order;
  });
}

interface Filterable {
  name: string;
  position_group: string | null;
  team_id: string;
  age: number | null;
  minutes: number | null;
}

function matches(row: Filterable, q: Query): boolean {
  const ageMin = num(q.age_min);
  const ageMax = num(q.age_max);
  if (q.q && !fold(row.name).includes(fold(String(q.q)))) return false;
  if (q.position_group && row.position_group !== q.position_group) return false;
  if (q.team && row.team_id !== q.team) return false;
  if (ageMin !== null && (row.age === null || row.age < ageMin)) return false;
  if (ageMax !== null && (row.age === null || row.age > ageMax)) return false;
  return (row.minutes ?? 0) >= (num(q.min_minutes) ?? 0);
}

const PLAYER_SORT: Record<string, keyof PlayerSummary> = {
  minutes: "minutes", name: "name", age: "age", xg: "xg", value: "market_value_eur", goals: "goals",
};
const VALUE_SORT: Record<string, keyof Valuation> = {
  gap_pct: "gap_pct", gap_eur: "gap_eur", actual: "actual_eur", predicted: "predicted_eur",
  age: "age", name: "name", minutes: "minutes",
};

export function filterPlayers(rows: PlayerSummary[], q: Query): Page<PlayerSummary> {
  const sort = String(q.sort ?? "minutes");
  const key = PLAYER_SORT[sort] ?? "minutes";
  return page(sortBy(rows.filter((r) => matches(r, q)), (r) => r[key] as string | number | null, sort !== "name"), q);
}

export function filterValues(rows: Valuation[], q: Query): Page<Valuation> {
  const minGap = num(q.min_gap_pct);
  const key = VALUE_SORT[String(q.sort ?? "gap_pct")] ?? "gap_pct";
  const kept = rows.filter((r) => matches(r, q) && (minGap === null || r.gap_pct >= minGap));
  return page(sortBy(kept, (r) => r[key] as string | number | null, q.direction !== "asc"), q);
}

export function filterFixtures(rows: Fixture[], q: Query): Page<Fixture> {
  const kept = rows.filter((f) =>
    (!q.status || f.status === q.status)
    && (!q.team || f.home_team_id === q.team || f.away_team_id === q.team)
    && (!q.date_from || (f.match_date ?? "") >= String(q.date_from))
    && (!q.date_to || (f.match_date ?? "") <= String(q.date_to)));
  return page(sortBy(kept, (f) => f.kickoff_utc ?? f.match_date ?? null, q.sort === "desc"), q);
}

async function similar(playerId: string, q: Query): Promise<SimilarResponse> {
  const [data, player] = await Promise.all([
    file<SimilarResponse>(`similar/${playerId}`),
    file<PlayerDetail>(`player/${playerId}`),
  ]);
  const ageMax = num(q.age_max);
  const items = data.items
    .filter((r) => !q.exclude_team || r.team_id !== player.team_id)
    .filter((r) => ageMax === null || (r.age !== null && r.age <= ageMax));
  return { ...data, items: items.slice(0, num(q.limit) ?? 10) };
}

async function compare(a: string, b: string): Promise<Comparison> {
  const [left, right, near] = await Promise.all([
    file<PlayerDetail>(`player/${a}`),
    file<PlayerDetail>(`player/${b}`),
    file<SimilarResponse>(`similar/${a}`).catch(() => null),
  ]);
  const match = near?.items.find((r) => r.player_id === b);
  return {
    a: left,
    b: right,
    similarity_score: match?.similarity_score ?? null,
    explanation: match ? { shared_strengths: match.shared_strengths, main_differences: match.main_differences } : null,
    note: match ? null : "These two are not close matches, so the public snapshot has no written comparison.",
  };
}

const needsServer = (): Promise<never> => Promise.reject(new ApiError(NEEDS_SERVER, 0, "static"));

export const staticApi: Api = {
  fixtures: async (q) => filterFixtures(await file<Fixture[]>("fixtures"), q),
  upcoming: async (limit = 10) => (await file<Fixture[]>("upcoming")).slice(0, limit),
  fixture: async (fixtureId) => {
    const found = (await file<Fixture[]>("fixtures")).find((f) => f.fixture_id === fixtureId);
    if (!found) throw new ApiError("This isn't in the public snapshot.", 404, "not_found");
    return found;
  },
  results: async (q) => page(await file<Fixture[]>("results"), q),
  teamForm: (teamId) => file<TeamForm>(`form/${teamId}`),
  teamNews: () => file<TeamNews>("team-news"),
  teams: () => file<Team[]>("teams"),
  standings: () => file<Standings>("standings"),
  players: async (q) => filterPlayers(await file<PlayerSummary[]>("players"), q),
  player: (playerId) => file<PlayerDetail>(`player/${playerId}`),
  similar,
  compare,
  values: async (q) => {
    const data = await file<ValuationPage>("values");
    return { ...data, ...filterValues(data.items, q) };
  },
  undervalued: async (q) => {
    const data = await file<Undervalued>("undervalued");
    return { ...data, items: data.items.slice(0, num(q.limit) ?? 25) };
  },
  valuation: (playerId) => file<ValuationDetail>(`valuation/${playerId}`),
  latestSimulation: () => file<Simulation>("simulation-latest"),
  simulationHistory: () => file<SimulationSummary[]>("simulation-history"),
  simulation: (simulationId) => file<Simulation>(`simulation/${simulationId}`),
  runSimulation: needsServer,
  squad: (teamId) => file<SquadView>(`squad/${teamId}`),
  replacement: needsServer,
  scenario: (scenarioId) => file<WhatIfScenario>(`scenario/${scenarioId}`),
  modelMetrics: () => file<ModelMetrics>("model-metrics"),
  models: () => file<ModelInfo[]>("models"),
  dataSources: () => file<DataSource[]>("data-sources"),
  dataHealth: () => file<DataHealth>("data-health"),
};
