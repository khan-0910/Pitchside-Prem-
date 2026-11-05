import { lazy, Suspense, useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";

import { ScrollTrigger } from "@/animations/gsap";
import { scrollToTop } from "@/animations/lenis";
import { SkeletonRows } from "@/components/ui/states";

const Home = lazy(() => import("@/pages/Home"));
const DashboardLayout = lazy(() =>
  import("@/components/layout/DashboardLayout").then((m) => ({ default: m.DashboardLayout })),
);
const Overview = lazy(() => import("@/pages/Overview"));
const MatchCentre = lazy(() => import("@/pages/MatchCentre"));
const PlayerLab = lazy(() => import("@/pages/PlayerLab"));
const TransferIntelligence = lazy(() => import("@/pages/TransferIntelligence"));
const SeasonSimulator = lazy(() => import("@/pages/SeasonSimulator"));
const WhatIfLab = lazy(() => import("@/pages/WhatIfLab"));
const ModelPerformance = lazy(() => import("@/pages/ModelPerformance"));
const DataHealth = lazy(() => import("@/pages/DataHealth"));
const Settings = lazy(() => import("@/pages/Settings"));

function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    scrollToTop();
    ScrollTrigger.refresh();
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4">
      <h1 className="text-6xl">Out of play</h1>
      <p className="text-muted">That page does not exist.</p>
      <Link className="btn-primary w-fit" to="/">
        Back to Pitchside
      </Link>
    </main>
  );
}

const Loading = () => (
  <div className="p-6">
    <SkeletonRows />
  </div>
);

export function App() {
  return (
    <>
      <ScrollReset />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/app" element={<DashboardLayout />}>
            <Route index element={<Overview />} />
            <Route path="matches" element={<MatchCentre />} />
            <Route path="players" element={<PlayerLab />} />
            <Route path="transfers" element={<TransferIntelligence />} />
            <Route path="simulator" element={<SeasonSimulator />} />
            <Route path="what-if" element={<WhatIfLab />} />
            <Route path="models" element={<ModelPerformance />} />
            <Route path="data" element={<DataHealth />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
