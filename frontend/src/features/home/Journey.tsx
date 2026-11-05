import { useRef } from "react";
import { Link } from "react-router-dom";

import { PassingLine } from "./PassingLine";
import { HowItWorks, MatchSection, PlayerSection, Transparency, TransferSection, WhatIfSection } from "./sections";
import { TableJourney } from "./TableJourney";

/** Everything below the hero. Loaded separately so the first paint stays light. */
export default function Journey() {
  const journey = useRef<HTMLDivElement>(null);
  return (
    <div ref={journey} className="relative">
      <PassingLine container={journey} />
      <MatchSection />
      <PlayerSection />
      <TransferSection />
      <TableJourney />
      <WhatIfSection />
      <HowItWorks />
      <Transparency />
      <section className="relative z-10 flex min-h-[80dvh] flex-col items-start justify-center gap-7 px-4 sm:px-8 lg:px-24">
        <h2 data-pass className="text-[clamp(4rem,14vw,12rem)] leading-[0.88]">
          SEE THE GAME DIFFERENTLY.
        </h2>
        <Link to="/app" className="btn-primary">Open the dashboard</Link>
      </section>
    </div>
  );
}
