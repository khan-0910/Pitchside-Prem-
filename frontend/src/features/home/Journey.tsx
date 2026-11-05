import { useRef } from "react";

import { GoalFinale } from "./GoalFinale";
import { PassingLine } from "./PassingLine";
import {
  FixturesSection,
  HowItWorks,
  MatchSection,
  PlayerSection,
  TransferSection,
  WhatIfSection,
} from "./sections";
import { TableJourney } from "./TableJourney";

/** Everything below the hero, one unbroken stretch of grass. Loaded separately to keep first paint light. */
export default function Journey() {
  const journey = useRef<HTMLDivElement>(null);
  return (
    <div ref={journey} className="grass on-grass relative">
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[3.5vw] w-[3.5px] bg-white/90 max-sm:left-2" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-[3.5vw] w-[3.5px] bg-white/90 max-sm:right-2" />
      <PassingLine container={journey} />
      <MatchSection />
      <FixturesSection />
      <PlayerSection />
      <TransferSection />
      <TableJourney />
      <WhatIfSection />
      <HowItWorks />
      <GoalFinale />
    </div>
  );
}
