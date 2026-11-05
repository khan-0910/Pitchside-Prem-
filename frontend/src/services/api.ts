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
  SquadView,
  Standings,
  Team,
  TeamForm,
  TeamNews,
  Undervalued,
  ValuationDetail,
  ValuationPage,
  WhatIfScenario,
} from "@/types/api";

import { staticApi } from "./static-api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

function url(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return `/api/v1${path}${text ? `?${text}` : ""}`;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiError("The Pitchside API can't be reached. Check that the backend is running.", 0, "offline");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(body?.error?.message ?? `Request failed (${response.status})`, response.status, body?.error?.code ?? "error");
  }
  return body as T;
}

const get = <T>(path: string, query?: Query) => request<T>(url(path, query));
const post = <T>(path: string, body: unknown) =>
  request<T>(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const id = encodeURIComponent;

export const STATIC = Boolean(import.meta.env.VITE_STATIC);

const liveApi = {
  fixtures: (q: Query) => get<Page<Fixture>>("/fixtures", q),
  upcoming: (limit = 10) => get<Fixture[]>("/fixtures/upcoming", { limit }),
  fixture: (fixtureId: string) => get<Fixture>(`/fixtures/${id(fixtureId)}`),
  results: (q: Query) => get<Page<Fixture>>("/matches/results", q),
  teamForm: (teamId: string) => get<TeamForm>(`/matches/teams/${id(teamId)}/form`),
  teamNews: () => get<TeamNews>("/matches/team-news"),
  teams: () => get<Team[]>("/teams"),
  standings: () => get<Standings>("/standings"),
  players: (q: Query) => get<Page<PlayerSummary>>("/players", q),
  player: (playerId: string) => get<PlayerDetail>(`/players/${id(playerId)}`),
  similar: (playerId: string, q: Query) => get<SimilarResponse>(`/players/${id(playerId)}/similar`, q),
  compare: (a: string, b: string) => get<Comparison>("/players/compare", { a, b }),
  values: (q: Query) => get<ValuationPage>("/transfers/values", q),
  undervalued: (q: Query) => get<Undervalued>("/transfers/undervalued", q),
  valuation: (playerId: string) => get<ValuationDetail>(`/transfers/${id(playerId)}/valuation`),
  squad: (teamId: string) => get<SquadView>(`/what-if/teams/${id(teamId)}/squad`),
  replacement: (body: { team_id: string; player_out_id: string; player_in_id: string; fixture_ids: string[] }) =>
    post<WhatIfScenario>("/what-if/player-replacement", body),
  scenario: (scenarioId: string) => get<WhatIfScenario>(`/what-if/${id(scenarioId)}`),
  modelMetrics: () => get<ModelMetrics>("/models/metrics"),
  models: () => get<ModelInfo[]>("/models"),
  dataSources: () => get<DataSource[]>("/data/sources"),
  dataHealth: () => get<DataHealth>("/data/health"),
};

export type Api = typeof liveApi;
export const api: Api = STATIC ? staticApi : liveApi;
