import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import DataHealth from "@/pages/DataHealth";
import MatchCentre from "@/pages/MatchCentre";
import ModelPerformance from "@/pages/ModelPerformance";
import Overview from "@/pages/Overview";
import PlayerLab from "@/pages/PlayerLab";
import Settings from "@/pages/Settings";
import TransferIntelligence from "@/pages/TransferIntelligence";
import { fixture, mockApi } from "@/test/fixtures";
import { renderPage } from "@/test/render";
import { useUi } from "@/stores/ui";
import { prefersReducedMotion } from "@/animations/useReducedMotion";
import type { PlayerSummary, Valuation } from "@/types/api";

const teams = [{ team_id: "arsenal", name: "Arsenal", short_name: "Arsenal", tla: "ARS" }];
const page = <T,>(items: T[]) => ({ items, total: items.length, limit: 50, offset: 0 });

const person = (id: string, name: string, team_id = "arsenal"): PlayerSummary => ({
  player_id: id, name, date_of_birth: null, age: 25, position: "Forward", sub_position: null, team_id,
  team: "Arsenal", team_short: "Arsenal", tla: "ARS", availability: "a", chance_next_round: null, minutes: 900,
  goals: 5, assists: 2, xg: 4.2, xa: 1.1, fpl_price: 8, market_value_eur: 40e6, valuation_date: "2026-06-01",
  position_group: "ST", role: "Direct striker",
});
const radar = [{ stat: "xg", label: "xG", percentile: 80, per90: 0.5 }, { stat: "threat", label: "Threat", percentile: 60, per90: 30 }, { stat: "goals", label: "Goals", percentile: 70, per90: 0.4 }];
const detail = (id: string, name: string) => ({
  ...person(id, name), foot: "left", height_cm: 180, nationality: "England", news: [], profile_note: null,
  profile: { position_group: "ST", position_name: "Striker", role: "Direct striker", weighted_minutes: 900, per90: { xg: 0.5, threat: 30, goals: 0.4 }, percentiles: { xg: 80, threat: 60, goals: 70 }, radar },
});

describe("Match Centre", () => {
  it("filters by club and asks the API for it", async () => {
    const fetchMock = mockApi({ "/teams": teams, "/fixtures": page([fixture]), "/matches/team-news": { updated_at: null, teams: {} }, "/matches": { team: teams[0], matches: [], points: 0 } });
    renderPage(<MatchCentre />);
    await screen.findAllByText("Everton", { exact: false });
    await userEvent.selectOptions(await screen.findByLabelText("Club"), await screen.findByRole("option", { name: "Arsenal" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("team=arsenal"))).toBe(true));
  });

  it("switches to results and sorts newest first", async () => {
    const fetchMock = mockApi({ "/teams": teams, "/fixtures": page([]) });
    renderPage(<MatchCentre />);
    await userEvent.click(screen.getByRole("tab", { name: "Results" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => /status=FINISHED.*sort=desc/.test(String(u)))).toBe(true));
    expect(await screen.findByText("No matches fit these filters.")).toBeInTheDocument();
  });

  it("opens the detail panel with scoreline chances", async () => {
    mockApi({ "/teams": teams, "/fixtures": page([fixture]), "/matches/team-news": { updated_at: null, teams: {} }, "/matches": { team: teams[0], matches: [], points: 0 } });
    renderPage(<MatchCentre />);
    await userEvent.click(await screen.findByRole("button", { expanded: false }));
    expect(await screen.findByText(/Scoreline chances/)).toBeInTheDocument();
  });

  it("replays how the model built the prediction", async () => {
    const odds = (home_win: number, draw: number, away_win: number) => ({ home_win, draw, away_win });
    const explained = { ...fixture, prediction: { ...fixture.prediction!, explanation: [
      { key: "start", title: "A typical match", note: "How league matches usually end.", facts: [], probabilities: odds(0.45, 0.26, 0.29) },
      { key: "strength", title: "Team strength", note: "Ratings and squads.", facts: [{ label: "Elo rating", home: "1,610", away: "1,480", edge: "home" as const }], probabilities: odds(0.58, 0.24, 0.18) },
    ] } };
    mockApi({ "/teams": teams, "/fixtures": page([explained]), "/matches/team-news": { updated_at: null, teams: {} }, "/matches": { team: teams[0], matches: [], points: 0 } });
    renderPage(<MatchCentre />);
    await userEvent.click(await screen.findByRole("button", { expanded: false }));
    expect(await screen.findByRole("heading", { name: "How the model got here" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Team strength/ }));
    expect(screen.getByRole("button", { name: /Team strength/ })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("rowheader", { name: "Elo rating" })).toBeInTheDocument();
    expect(screen.getByText("Arsenal +13, draw −2, Everton −11")).toBeInTheDocument();
  });

  it("shows an API failure with a retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "x", message: "Database is busy" } }), { status: 503 })));
    renderPage(<MatchCentre />);
    expect(await screen.findByText("Database is busy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("Player Lab", () => {
  const routes = {
    "/teams": teams,
    "/players/p1/similar": {
      player_id: "p1", score_note: "Not a probability.",
      items: [{ ...person("p2", "Bo Sample"), similarity_score: 91.4, shared_strengths: [], main_differences: [] }],
    },
    "/players/compare": {
      a: detail("p1", "Ada Test"), b: detail("p2", "Bo Sample"), similarity_score: 91, note: null,
      explanation: { shared_strengths: [{ stat: "xg", label: "xG", a_per90: 0.5, b_per90: 0.4 }], main_differences: [] },
    },
    "/players/p1": detail("p1", "Ada Test"),
    "/players/p2": detail("p2", "Bo Sample"),
    "/players": page([person("p1", "Ada Test"), person("p2", "Bo Sample")]),
  };

  it("searches through the API", async () => {
    const fetchMock = mockApi(routes);
    renderPage(<PlayerLab />);
    await userEvent.type(screen.getByLabelText("Search by name"), "ada");
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("q=ada"))).toBe(true));
  });

  it("shows a profile, labels the score, and compares two players", async () => {
    mockApi(routes);
    renderPage(<PlayerLab />);
    expect(await screen.findByRole("heading", { name: "Ada Test" })).toBeInTheDocument();
    expect(await screen.findByText("Not a probability.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Compare with Bo Sample/ }));
    expect(await screen.findByText("Shared strengths")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Ada Test compared with Bo Sample/ })).toBeInTheDocument();
  });
});

describe("Transfer Intelligence", () => {
  const v: Valuation = {
    player_id: "p1", name: "Ada Test", age: 25, team_id: "arsenal", team: "Arsenal", team_short: "Arsenal", tla: "ARS",
    position_group: "ST", role: "r", minutes: 900, goals: 5, assists: 2, xg: 4, xa: 1, actual_eur: 40e6, predicted_eur: 46e6,
    low_eur: 38e6, high_eur: 55e6, valuation_date: "2026-06-01", model_version: "t", gap_eur: 6e6, gap_pct: 15,
    valuation_age_days: 150, assessment: "within_uncertainty", stale_valuation: true,
  };

  it("sorts through the API and flags stale values", async () => {
    const fetchMock = mockApi({ "/teams": teams, "/transfers/values": { ...page([v]), note: "Not a fee.", minimum_minutes_for_flag: 450 } });
    renderPage(<TransferIntelligence />);
    expect(await screen.findByText("Old value")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Age" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes("sort=age"))).toBe(true));
    await userEvent.click(screen.getByRole("button", { name: "Age" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => /sort=age&direction=asc/.test(String(u)))).toBe(true));
    expect(screen.getByRole("columnheader", { name: "Age" })).toHaveAttribute("aria-sort", "ascending");
  });
});


describe("Overview, Data Health and Model Performance", () => {
  it("labels a table worked out from results", async () => {
    mockApi({
      "/standings": { season_id: "2026-27", derived: true, source: "derived", table: [{ ...teams[0], position: 1, played: 9, won: 8, drawn: 0, lost: 1, goals_for: 14, goals_against: 5, goal_difference: 9, points: 24 }] },
      "/fixtures/upcoming": [fixture], "/matches/results": page([]), "/players": page([]), "/transfers/undervalued": { items: [], note: "", rule: "", clear_signals: 0 }, "/data/sources": [],
    });
    renderPage(<Overview />);
    expect(await screen.findByText(/any points deduction is not included/)).toBeInTheDocument();
  });

  it("marks who moved since the latest matchweek", async () => {
    const row = (team_id: string, short_name: string, position: number, before: number, points: number) => ({
      team_id, name: short_name, short_name, tla: short_name.slice(0, 3).toUpperCase(), position,
      before: { position: before, played: 8, goal_difference: 0, points: points - 3 },
      played: 9, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0, goal_difference: 0, points,
    });
    mockApi({
      "/standings": { season_id: "2026-27", derived: false, source: "football_data_org", moves_since: "2026-10-31", table: [row("ars", "Arsenal", 1, 2, 24), row("mci", "Man City", 2, 1, 21), row("bha", "Brighton", 3, 3, 19)] },
      "/fixtures/upcoming": [fixture], "/matches/results": page([]), "/players": page([]), "/transfers/undervalued": { items: [], note: "", rule: "", clear_signals: 0 }, "/matches/team-news": { updated_at: null, teams: {} },
    });
    useUi.getState().setReduceMotion(true);
    renderPage(<Overview />);
    expect(await screen.findByText(/Arrows show moves since/)).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText(/up/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/down/)).toBeInTheDocument();
    expect(within(rows[2]).getByText("Same place")).toBeInTheDocument();
    useUi.getState().setReduceMotion(false);
  });

  it("shows why a source is down", async () => {
    mockApi({
      "/data/health": {
        sources: [{ source_id: "understat", name: "Understat", description: "xG", requires_key: false, status: "UNAVAILABLE", last_attempt_at: null, last_success_at: null, last_error: "understat.com shows a maintenance page", records: 0, coverage: null, upstream_updated_at: null, data_as_of: null }],
        failed_runs: [], quality_checks: [], unresolved_entities: {}, models: [],
      },
    });
    renderPage(<DataHealth />);
    expect(await screen.findByText("understat.com shows a maintenance page")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("says so when no model exists rather than showing numbers", async () => {
    mockApi({ "/models/metrics": { match: null, similarity: null, transfer: null } });
    renderPage(<ModelPerformance />);
    expect(await screen.findByText("No models have been trained yet.")).toBeInTheDocument();
  });

  it("includes the disclaimer beside real metrics", async () => {
    mockApi({
      "/models/metrics": {
        similarity: null, transfer: null,
        match: {
          model_version: "m", model_type: "match", algorithm: "logistic", trained_at: "2026-11-05", train_start: null, train_end: null, test_start: null, test_end: null,
          n_train: 1, n_test: 10, params: {}, notes: null, disclaimer: "It is not betting advice.",
          metrics: { test: { model: { log_loss: 1.04, brier: 0.63, accuracy: 0.45 } }, validation: {} },
          reports: { backtest: [], calibration: { home: [], draw: [], away: [] }, confusion: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
        },
      },
    });
    renderPage(<ModelPerformance />);
    expect(await screen.findByText("1.040")).toBeInTheDocument();
    expect(screen.getByText("It is not betting advice.")).toBeInTheDocument();
  });
});

describe("Navigation and settings", () => {
  it("opens and closes the mobile menu from the keyboard", async () => {
    mockApi({ "/data/sources": [] });
    renderPage(
      <Routes>
        <Route path="/app" element={<DashboardLayout />}>
          <Route index element={<p>Inside</p>} />
        </Route>
      </Routes>,
      "/app",
    );
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = await screen.findByRole("dialog", { name: "Menu" });
    expect(within(dialog).getByRole("link", { name: "Match Centre" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(useUi.getState().navOpen).toBe(false));
  });

  it("keeps model and data pages in the footer, not the menu", async () => {
    mockApi({ "/data/sources": [] });
    renderPage(<Routes><Route path="/app" element={<DashboardLayout />}><Route index element={<p>x</p>} /></Route></Routes>, "/app");
    const menu = await screen.findByRole("navigation", { name: "Dashboard" });
    const footer = screen.getByRole("navigation", { name: "Footer" });
    expect(within(menu).queryByRole("link", { name: /data health/i })).toBeNull();
    expect(within(menu).queryByRole("link", { name: /model performance/i })).toBeNull();
    for (const name of ["Data health", "Model performance", "Privacy", "Terms", "Data credits"]) {
      expect(within(footer).getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("offers a skip link and marks the current page", async () => {
    mockApi({ "/data/sources": [] });
    renderPage(<Routes><Route path="/app" element={<DashboardLayout />}><Route index element={<p>x</p>} /></Route></Routes>, "/app");
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });

  it("lets a person turn motion off from settings", async () => {
    renderPage(<Settings />);
    expect(prefersReducedMotion()).toBe(false);
    await userEvent.click(screen.getByRole("checkbox", { name: /Reduce motion/ }));
    expect(prefersReducedMotion()).toBe(true);
    useUi.getState().setReduceMotion(false);
  });
});
