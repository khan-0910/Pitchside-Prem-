import { useRef } from "react";

import { PassingLine } from "./PassingLine";
import { GoalFinale } from "./GoalFinale";
import {
  FixturesSection,
  HowItWorks,
  MatchSection,
  PlayerSection,
  Transparency,
  TransferSection,
  WhatIfSection,
} from "./sections";
import { TableJourney } from "./TableJourney";

/** Everything below the hero. Loaded separately so the first paint stays light. */
export default function Journey() {
  const journey = useRef<HTMLDivElement>(null);
  return (
    <div ref={journey} className="pitch-stripes relative">
      <PassingLine container={journey} />
      <MatchSection />
      <FixturesSection />
      <PlayerSection />
      <TransferSection />
      <TableJourney />
      <WhatIfSection />
      <HowItWorks />
      <Transparency />
      <GoalFinale />
    </div>
  );
}
