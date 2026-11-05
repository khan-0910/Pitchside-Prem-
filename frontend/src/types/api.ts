export type SourceStatus = "LIVE" | "CACHED" | "STALE" | "UNAVAILABLE";

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Prediction {
  probabilities: { home_win: number; draw: number; away_win: number };
  expected_goals: { home: number; away: number; total: number };
  most_likely_score: string;
  score_matrix: number[][] | null;
  confidence: { score: number; label: string };
  model_version: string;
  predicted_at: string;
  data_timestamp: string;
  limitations: string[];
}

export interface Fixture {
  fixture_id: string;
  season_id: string;
  matchday: number | null;
  kickoff_utc: string | null;
  match_date: string | null;
  status: "SCHEDULED" | "IN_PLAY" | "FINISHED" | "POSTPONED";
  home_team_id: string;
  home_team: string;
  home_short: string;
  home_tla: string;
  away_team_id: string;
  away_team: string;
  away_short: string;
  away_tla: string;
  home_goals: number | null;
  away_goals: number | null;
  prediction: Prediction | null;
}

export interface Team {
  team_id: string;
  name: string;
  short_name: string;
  tla: string;
}

export interface StandingRow extends Team {
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
}

export interface Standings {
  season_id: string | null;
  source: string | null;
  derived: boolean;
  table: StandingRow[];
}

export interface TeamForm {
  team: Team;
  points: number;
  matches: {
    fixture_id: string;
    match_date: string;
    is_home: boolean;
    opponent: string;
    goals_for: number;
    goals_against: number;
    result: "W" | "D" | "L";
  }[];
}

export interface RadarAxis {
  stat: string;
  label: string;
  percentile: number;
  per90: number;
}

export interface PlayerProfile {
  position_group: string;
  position_name: string;
  role: string;
  weighted_minutes: number;
  per90: Record<string, number>;
  percentiles: Record<string, number>;
  radar: RadarAxis[];
}

export interface PlayerSummary {
  player_id: string;
  name: string;
  date_of_birth: string | null;
  age: number | null;
  position: string | null;
  sub_position: string | null;
  team_id: string;
  team: string;
  team_short: string;
  tla: string;
  availability: string | null;
  chance_next_round: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  xg: number | null;
  xa: number | null;
  fpl_price: number | null;
  market_value_eur: number | null;
  valuation_date: string | null;
  position_group: string | null;
  role: string | null;
}

export interface PlayerDetail extends PlayerSummary {
  foot: string | null;
  height_cm: number | null;
  nationality: string | null;
  profile: PlayerProfile | null;
  profile_note: string | null;
  news: { status: string; news: string; news_added: string | null }[];
}

export interface StatLine {
  stat: string;
  label: string;
  a_per90: number;
  b_per90: number;
}

export interface SimilarPlayer extends PlayerSummary {
  similarity_score: number;
  shared_strengths: StatLine[];
  main_differences: StatLine[];
}

export interface SimilarResponse {
  player_id: string;
  items: SimilarPlayer[];
  player?: PlayerSummary;
  note?: string;
  score_note?: string;
}

export interface TeamNewsPlayer {
  player_id: string;
  name: string;
  availability: string;
  chance_next_round: number | null;
  news: string | null;
}

export type TeamNews = Record<string, TeamNewsPlayer[]>;

export interface Comparison {
  a: PlayerDetail;
  b: PlayerDetail;
  similarity_score: number | null;
  explanation: { shared_strengths: StatLine[]; main_differences: StatLine[] } | null;
  note: string | null;
}

export type Assessment = "model_undervalued" | "model_overvalued" | "within_uncertainty" | "small_sample";

export interface Valuation {
  player_id: string;
  name: string;
  age: number | null;
  team_id: string;
  team: string;
  team_short: string;
  tla: string;
  position_group: string | null;
  role: string | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  xg: number | null;
  xa: number | null;
  actual_eur: number;
  predicted_eur: number;
  low_eur: number;
  high_eur: number;
  valuation_date: string;
  model_version: string;
  gap_eur: number;
  gap_pct: number;
  valuation_age_days: number;
  assessment: Assessment;
  stale_valuation: boolean;
}

export interface ValuationPage extends Page<Valuation> {
  note: string;
  minimum_minutes_for_flag: number;
}

export interface Undervalued {
  items: Valuation[];
  note: string;
  rule: string;
  clear_signals: number;
}

export interface ValuationDetail {
  estimate: Valuation | null;
  history: { valuation_date: string; value_eur: number; club_name: string | null }[];
  note: string;
}

export interface SimulationRow extends Team {
  simulation_id: string;
  current_points: number;
  expected_points: number;
  expected_position: number;
  p_title: number;
  p_top4: number;
  p_top6: number;
  p_relegation: number;
  points_p10: number;
  points_p90: number;
  position_distribution: number[];
}

export interface Simulation {
  simulation_id: string;
  created_at: string;
  iterations: number;
  seed: number;
  model_version: string;
  season_id: string;
  fixtures_remaining: number;
  max_standard_error: number;
  results: SimulationRow[];
  note: string;
}

export interface SimulationSummary {
  simulation_id: string;
  created_at: string;
  iterations: number;
  seed: number;
  model_version: string;
  fixtures_remaining: number;
  title_favourite: string;
  p_title: number;
}

export interface SquadPlayer {
  player_id: string;
  name: string;
  position: string | null;
  market_value_eur: number | null;
  minutes: number;
  in_likely_14: boolean;
  position_group: string | null;
  role: string | null;
  availability: string | null;
}

export interface SquadView {
  team_id: string;
  team: string;
  players: SquadPlayer[];
  fixtures: { fixture_id: string; date: string; home_team: string; away_team: string }[];
}

export interface WhatIfMatchLine {
  home_win: number;
  draw: number;
  away_win: number;
  xg_home: number;
  xg_away: number;
  most_likely_score: string;
}

export interface WhatIfCard {
  player_id: string;
  name: string;
  age: number | null;
  team: string | null;
  position_group: string | null;
  role: string | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  xg: number | null;
  xa: number | null;
  market_value_eur: number | null;
  valuation_date: string | null;
  availability: string | null;
  profile: PlayerProfile | null;
}

export interface WhatIfScenario {
  scenario_id: string;
  hypothetical: true;
  created_at: string;
  team_id: string;
  team: string;
  model_version: string;
  player_out: WhatIfCard;
  player_in: WhatIfCard;
  model_inputs_changed: boolean;
  model_inputs: {
    squad_value_log: { before: number; after: number };
    squad_goal_output_per_90: { before: number; after: number };
    features_changed: string[];
  };
  squad_value: { before: number; after: number; change: number; unvalued_players: number };
  positional_balance: { before: Record<string, number>; after: Record<string, number>; note: string };
  matches: {
    fixture_id: string;
    date: string;
    is_home: boolean;
    home_team: string;
    away_team: string;
    before: WhatIfMatchLine;
    after: WhatIfMatchLine;
    win_change: number;
    expected_goals_change: number;
  }[];
  trade_offs: { advantages: string[]; disadvantages: string[]; note?: string[] };
  position_warning: string | null;
  assumptions: string[];
  notes: string[];
}

export interface ModelInfo {
  model_version: string;
  model_type: string;
  algorithm: string;
  trained_at: string;
  train_start: string | null;
  train_end: string | null;
  test_start: string | null;
  test_end: string | null;
  n_train: number | null;
  n_test: number | null;
  params: Record<string, unknown>;
  notes: string | null;
  metrics: Record<string, Record<string, Record<string, number>>>;
  reports: Record<string, unknown>;
  disclaimer: string;
}

export interface BacktestRow {
  season: string;
  n: number;
  model_log_loss: number;
  model_accuracy: number;
  baseline_log_loss: number;
  market_log_loss?: number;
}

export type ModelMetrics = Record<"match" | "similarity" | "transfer", ModelInfo | null>;

export interface DataSource {
  source_id: string;
  name: string;
  description: string;
  requires_key: boolean;
  optional: boolean;
  note: string | null;
  status: SourceStatus;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  records: number;
  coverage: string | null;
  upstream_updated_at: string | null;
  data_as_of: string | null;
}

export interface DataHealth {
  sources: DataSource[];
  failed_runs: { source_id: string; at: string; status: string; error: string | null }[];
  quality_checks: { source_id: string; check: string; passed: boolean; detail: string; checked_at: string }[];
  unresolved_entities: Record<string, number>;
  models: { model_type: string; model_version: string; trained_at: string }[];
}
