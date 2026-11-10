import { useQuery } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

import { makeQueryClient } from "@/app/providers";
import { euros, initials, percent, signed } from "@/lib/format";
import { ApiError, api } from "@/services/api";
import { setReducedMotion } from "@/test/setup";
import type { Prediction } from "@/types/api";

import { AnimatedNumber } from "./AnimatedNumber";
import { ProbabilityBar } from "./ProbabilityBar";
import { DataState, ErrorState } from "./states";
import { StatusPill } from "./StatusPill";

function wrap(children: ReactNode) {
  return <QueryClientProvider client={makeQueryClient()}>{children}</QueryClientProvider>;
}

function Demo({ fn }: { fn: () => Promise<string[]> }) {
  const query = useQuery({ queryKey: ["demo", fn], queryFn: fn });
  return <DataState query={query} isEmpty={(d) => d.length === 0}>{(d) => <p>{d.join()}</p>}</DataState>;
}

describe("DataState", () => {
  it("shows loading, then data", async () => {
    render(wrap(<Demo fn={async () => ["ok"]} />));
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(await screen.findByText("ok")).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    render(wrap(<Demo fn={async () => []} />));
    expect(await screen.findByText("Nothing to show yet")).toBeInTheDocument();
  });

  it("shows the error and retries", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new ApiError("Model is not ready", 503, "unavailable")).mockResolvedValue(["back"]);
    render(wrap(<Demo fn={fn} />));
    expect(await screen.findByRole("alert")).toHaveTextContent("Model is not ready");
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("back")).toBeInTheDocument();
  });
});

describe("api client", () => {
  it("turns the error envelope into an ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "not_found", message: "Player not found" } }), { status: 404 })));
    await expect(api.player("x")).rejects.toMatchObject({ status: 404, code: "not_found", message: "Player not found" });
  });

  it("reports an unreachable backend plainly", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    await expect(api.teams()).rejects.toMatchObject({ code: "offline" });
  });

  it("drops empty query values and encodes ids", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await api.players({ q: "", team: "arsenal", age_max: undefined });
    await api.fixture("2026-27:a:b");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/players?team=arsenal");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/fixtures/2026-27%3Aa%3Ab");
  });
});

describe("formatting", () => {
  it("formats money, percent and initials", () => {
    expect(euros(45_500_000)).toBe("€45.5m");
    expect(euros(1_450_000_000)).toBe("€1.45bn");
    expect(euros(-750_000)).toBe("-€750k");
    expect(euros(null)).toBe("No value");
    expect(percent(0.523)).toBe("52%");
    expect(signed(1.25)).toBe("+1.3");
    expect(initials("Kevin De Bruyne")).toBe("KD");
  });
});

describe("display components", () => {
  const prediction = {
    probabilities: { home_win: 0.5, draw: 0.3, away_win: 0.2 },
    expected_goals: { home: 1.5, away: 1, total: 2.5 },
  } as Prediction;

  it("gives the probability bar a text alternative", () => {
    render(<ProbabilityBar prediction={prediction} homeLabel="Arsenal" awayLabel="Fulham" />);
    expect(screen.getByRole("figure")).toHaveAccessibleName("Arsenal 50%, draw 30%, Fulham 20%");
  });

  it("jumps straight to the value with reduced motion", async () => {
    setReducedMotion(true);
    render(<AnimatedNumber value={42} />);
    await waitFor(() => expect(screen.getByLabelText("42")).toHaveTextContent("42"));
    setReducedMotion(false);
  });

  it("never labels cached data as live", () => {
    render(<StatusPill status="CACHED" />);
    expect(screen.getByText("Cached")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  it("renders an error with no retry when none is offered", () => {
    render(<ErrorState error={new Error("hidden detail")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("This data could not be loaded.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
