import { screen } from "@testing-library/react";

import Home from "@/pages/Home";
import { fixture, mockApi } from "@/test/fixtures";
import { renderPage } from "@/test/render";
import { setReducedMotion } from "@/test/setup";

const routes = {
  "/fixtures/upcoming": [fixture],
  "/data/sources": [{ source_id: "fpl", status: "CACHED", last_success_at: "2026-11-05T09:00:00Z" }],
  "/players": { items: [], total: 0, limit: 1, offset: 0 },
  "/transfers/undervalued": { items: [], note: "n", rule: "r", clear_signals: 0 },
  "/standings": { table: [] },
  "/models/metrics": { match: null },
};

describe("Home", { timeout: 20_000 }, () => {
  beforeEach(() => setReducedMotion(true));
  afterEach(() => setReducedMotion(false));

  it("renders the journey from API data and keeps content with motion off", async () => {
    mockApi(routes);
    renderPage(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "The game has a data side." })).toBeInTheDocument();
    expect(await screen.findByText("Most likely score", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /SEE THE GAME DIFFERENTLY/ })).toBeInTheDocument();
    expect(screen.queryByText(/What-If/)).not.toBeInTheDocument();
  });

  it("shows cached data as cached, never live", async () => {
    mockApi(routes);
    renderPage(<Home />);
    expect(await screen.findByText("Cached")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  it("says when a section has no data instead of inventing it", async () => {
    mockApi(routes);
    renderPage(<Home />);
    expect(await screen.findByText("No player has a positive gap right now", {}, { timeout: 8000 })).toBeInTheDocument();
  });
});
