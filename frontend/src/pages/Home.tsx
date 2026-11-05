import { lazy, Suspense } from "react";

import { LedTicker } from "@/components/football/LedTicker";
import { Hero } from "@/features/home/Hero";

const Journey = lazy(() => import("@/features/home/Journey"));

export default function Home() {
  return (
    <main>
      <Hero />
      <LedTicker />
      <Suspense fallback={<div className="min-h-dvh" />}>
        <Journey />
      </Suspense>
      <footer className="chalk border-t px-4 py-6 text-sm text-muted sm:px-8">
        Pitchside provides statistical analysis and predictive estimates for informational purposes only. It is not
        betting advice, and predictions are inherently uncertain. Not affiliated with the Premier League or any club.
      </footer>
    </main>
  );
}
