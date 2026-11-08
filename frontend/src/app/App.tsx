import { lazy, Suspense, useEffect } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";

import { ScrollTrigger } from "@/animations/gsap";
import { scrollToTop } from "@/animations/lenis";
import { SkeletonRows } from "@/components/ui/states";

const Home = lazy(() => import("@/pages/Home"));
const DashboardLayout = lazy(() =>
  import("@/components/layout/DashboardLayout").then((m) => ({ default: m.DashboardLayout })),
);
const pages = {
  overview: () => import("@/pages/Overview"),
  matches: () => import("@/pages/MatchCentre"),
  players: () => import("@/pages/PlayerLab"),
  transfers: () => import("@/pages/TransferIntelligence"),
  models: () => import("@/pages/ModelPerformance"),
  data: () => import("@/pages/DataHealth"),
  settings: () => import("@/pages/Settings"),
};
const Overview = lazy(pages.overview);
const MatchCentre = lazy(pages.matches);
const PlayerLab = lazy(pages.players);
const TransferIntelligence = lazy(pages.transfers);
const ModelPerformance = lazy(pages.models);
const DataHealth = lazy(pages.data);
const Settings = lazy(pages.settings);
const Legal = lazy(() => import("@/pages/Legal"));

const PRELOAD_DELAY_MS = 800;

/** Loads the other dashboard pages early, so moving between them shows no skeleton. */
function PreloadPages() {
  const { pathname } = useLocation();
  const inDashboard = pathname.startsWith("/app");
  useEffect(() => {
    if (!inDashboard) return;
    const timer = setTimeout(() => Object.values(pages).forEach((load) => void load()), PRELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [inDashboard]);
  return null;
}

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
      <PreloadPages />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/app" element={<DashboardLayout />}>
            <Route index element={<Overview />} />
            <Route path="matches" element={<MatchCentre />} />
            <Route path="players" element={<PlayerLab />} />
            <Route path="transfers" element={<TransferIntelligence />} />
            <Route path="models" element={<ModelPerformance />} />
            <Route path="data" element={<DataHealth />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="/privacy" element={<Legal page="privacy" />} />
          <Route path="/terms" element={<Legal page="terms" />} />
          <Route path="/credits" element={<Legal page="credits" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
