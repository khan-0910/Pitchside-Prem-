import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight,
  Banknote,
  ChartLine,
  Database,
  Dices,
  LayoutGrid,
  Menu,
  Settings as SettingsIcon,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Suspense, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { setScrollLocked } from "@/animations/lenis";
import { pageTransition } from "@/animations/transitions";
import { useReducedMotion } from "@/animations/useReducedMotion";
import { SkeletonRows } from "@/components/ui/states";
import { StatusPill } from "@/components/ui/StatusPill";
import { timeAgo } from "@/lib/format";
import { api } from "@/services/api";
import { useUi } from "@/stores/ui";

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/app/matches", label: "Match Centre", icon: Trophy },
  { to: "/app/players", label: "Player Lab", icon: Users },
  { to: "/app/transfers", label: "Transfer Intelligence", icon: Banknote },
  { to: "/app/simulator", label: "Season Simulator", icon: Dices },
  { to: "/app/what-if", label: "What-If Lab", icon: ArrowLeftRight },
  { to: "/app/models", label: "Model Performance", icon: ChartLine },
  { to: "/app/data", label: "Data Health", icon: Database },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon },
];

function Freshness() {
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.dataSources });
  const fpl = sources.data?.find((s) => s.source_id === "fpl");
  if (!fpl) return null;
  return (
    <Link to="/app/data" className="block text-sm">
      <StatusPill status={fpl.status} />
      <span className="block text-muted">Match data, {timeAgo(fpl.last_success_at).toLowerCase()}</span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Dashboard">
      <ul className="space-y-0.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `relative flex min-h-11 items-center gap-3 rounded-sm px-3 transition-colors ${
                  isActive ? "text-volt" : "text-flood/80 hover:text-flood"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-mark" aria-hidden className="absolute inset-y-2 left-0 w-0.5 bg-volt" />}
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const Logo = () => (
  <Link to="/" className="font-display text-2xl font-black tracking-wide">
    Pitchside
  </Link>
);

export function DashboardLayout() {
  const { navOpen, setNavOpen } = useUi();
  const { pathname } = useLocation();
  const reduced = useReducedMotion();

  useEffect(() => setNavOpen(false), [pathname, setNavOpen]);
  useEffect(() => {
    setScrollLocked(navOpen);
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen, setNavOpen]);

  return (
    <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-volt focus:p-2 focus:text-stadium">
        Skip to content
      </a>
      <aside className="chalk sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-deep/40 p-4 lg:flex">
        <Logo />
        <div className="flex-1">
          <NavList />
        </div>
        <Freshness />
      </aside>

      <header className="chalk sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-stadium/95 px-4 lg:hidden">
        <Logo />
        <button type="button" aria-label="Open menu" aria-expanded={navOpen} className="-mr-2 p-2" onClick={() => setNavOpen(true)}>
          <Menu aria-hidden />
        </button>
      </header>

      <AnimatePresence>
        {navOpen && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            data-lenis-prevent
            className="fixed inset-0 z-40 flex flex-col gap-6 overflow-y-auto bg-deep p-4 lg:hidden"
            initial={reduced ? { opacity: 0 } : { x: "100%" }}
            animate={reduced ? { opacity: 1 } : { x: 0 }}
            exit={reduced ? { opacity: 0 } : { x: "100%" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" aria-label="Close menu" className="-mr-2 p-2" onClick={() => setNavOpen(false)}>
                <X aria-hidden />
              </button>
            </div>
            <NavList onNavigate={() => setNavOpen(false)} />
            <Freshness />
          </motion.div>
        )}
      </AnimatePresence>

      <main id="main" className="mx-auto w-full max-w-7xl min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <Suspense fallback={<SkeletonRows />}>
          <motion.div key={pathname} {...pageTransition}>
            <Outlet />
          </motion.div>
        </Suspense>
      </main>
    </div>
  );
}

export function PageTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <header className="mb-7 max-w-3xl">
      <h1 className="text-5xl sm:text-6xl">{title}</h1>
      {intro && <p className="mt-2 text-muted">{intro}</p>}
    </header>
  );
}
