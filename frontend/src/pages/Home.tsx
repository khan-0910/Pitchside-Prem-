import { lazy, Suspense } from "react";

import { ScoreStrip } from "@/components/football/ScoreStrip";
import { Hero } from "@/features/home/Hero";

const Journey = lazy(() => import("@/features/home/Journey"));

export default function Home() {
  return (
    <main>
      <Hero />
      <ScoreStrip auto />
      <Suspense fallback={<div className="min-h-dvh" />}>
        <Journey />
      </Suspense>
      <footer className="bg-[#0f1512] px-5 py-6 text-sm text-white/75 sm:px-[5.5vw]">
        Pitchside provides statistical analysis and predictive estimates for informational purposes only. It is not
        betting advice, and predictions are inherently uncertain. Not affiliated with the Premier League or any club.
      </footer>
    </main>
  );
}
