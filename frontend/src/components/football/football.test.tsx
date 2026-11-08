import { render, screen } from "@testing-library/react";

import { ScoreStrip } from "@/components/football/ScoreStrip";
import { PitchMeter } from "@/features/matches/PitchMeter";
import { fixture, mockApi, prediction } from "@/test/fixtures";
import { clubColours, inkOn } from "@/lib/clubs";
import { renderPage } from "@/test/render";
import { setReducedMotion } from "@/test/setup";

import { StatusPill } from "@/components/ui/StatusPill";

import { BallLoader } from "./BallLoader";
import { PitchObjects } from "./PitchObjects";
import { ShirtCard } from "./ShirtCard";


describe("match graphics", () => {
  it("leans toward the likelier side in words", () => {
    render(<PitchMeter prediction={prediction} home="Arsenal" away="Everton" />);
    expect(screen.getByRole("img", { name: "Leans Arsenal" })).toBeInTheDocument();
  });

  it("calls an even game too close", () => {
    const even = { ...prediction, probabilities: { home_win: 0.36, draw: 0.3, away_win: 0.34 } };
    render(<PitchMeter prediction={even} home="Arsenal" away="Everton" />);
    expect(screen.getByRole("img", { name: "Too close to call" })).toBeInTheDocument();
  });
});

describe("Score strip", () => {
  it("shows real scores, and a scrollable list when motion is off", async () => {
    setReducedMotion(true);
    mockApi({ "/fixtures/upcoming": [fixture], "/matches/results": { items: [{ ...fixture, fixture_id: "x", home_goals: 2, away_goals: 1 }], total: 1, limit: 10, offset: 0 } });
    renderPage(<ScoreStrip />);
    expect(await screen.findByText("Full time")).toBeInTheDocument();
    expect(screen.getAllByText("ARS")).toHaveLength(2);
    setReducedMotion(false);
  });

  it("stays away when there is nothing real to show", async () => {
    mockApi({});
    const { container } = renderPage(<ScoreStrip />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("status", () => {
  it("does not raise the alarm for an optional source", () => {
    render(<StatusPill status="UNAVAILABLE" optional />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("keeps the alarm for a required source", () => {
    render(<StatusPill status="UNAVAILABLE" />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });
});

describe("club colours", () => {
  it("uses real shirt colours and a neutral fallback", () => {
    expect(clubColours("ARS")[0]).toBe("#EF0107");
    expect(clubColours("ZZZ")[0]).toBe("#5B655F");
  });

  it("picks readable text for light and dark shirts", () => {
    expect(inkOn("#FFFFFF")).toBe("#0F1512");
    expect(inkOn("#034694")).toBe("#FFFFFF");
  });
});

describe("decoration", () => {
  it("hides floating kit from assistive tech", () => {
    const { container } = render(<PitchObjects items={[{ kind: "yellow", left: "1%", top: "1%", depth: 1, tilt: 0 }]} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".kit")).toHaveLength(1);
  });

  it("shows a loader with a label and a card with text", () => {
    render(<><BallLoader label="Simulating" /><ShirtCard name="Ada Test" tla="ARS" detail="Arsenal, 25" score="91" /></>);
    expect(screen.getByRole("status", { name: "Simulating" })).toBeInTheDocument();
    expect(screen.getByText("Ada Test")).toBeInTheDocument();
  });
});
