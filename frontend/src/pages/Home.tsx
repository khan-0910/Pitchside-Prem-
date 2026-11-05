import { useRef } from "react";
import { Link } from "react-router-dom";

import { Hero } from "@/features/home/Hero";
import { PassingLine } from "@/features/home/PassingLine";
import {
  HowItWorks,
  MatchSection,
  PlayerSection,
  Transparency,
  TransferSection,
  WhatIfSection,
} from "@/features/home/sections";
import { TableJourney } from "@/features/home/TableJourney";

export default function Home() {
  const journey = useRef<HTMLDivElement>(null);
  return (
    <main>
      <Hero />
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
      <footer className="chalk border-t px-4 py-6 text-sm text-muted sm:px-8">
        Pitchside provides statistical analysis and predictive estimates for informational purposes only. It is not
        betting advice, and predictions are inherently uncertain. Not affiliated with the Premier League or any club.
      </footer>
    </main>
  );
}
