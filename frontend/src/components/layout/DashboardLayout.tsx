import { ArrowsLeftRight } from "@phosphor-icons/react/dist/csr/ArrowsLeftRight";
import { Gear } from "@phosphor-icons/react/dist/csr/Gear";
import { List } from "@phosphor-icons/react/dist/csr/List";
import { SneakerMove } from "@phosphor-icons/react/dist/csr/SneakerMove";
import { SoccerBall } from "@phosphor-icons/react/dist/csr/SoccerBall";
import { Strategy } from "@phosphor-icons/react/dist/csr/Strategy";
import { TShirt } from "@phosphor-icons/react/dist/csr/TShirt";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { AnimatePresence, motion } from "framer-motion";
import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";

import { setScrollLocked } from "@/animations/lenis";
import { pageTransition } from "@/animations/transitions";
import { useReducedMotion } from "@/animations/useReducedMotion";
import { ScoreStrip } from "@/components/football/ScoreStrip";
import { NavBall } from "@/components/layout/NavBall";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SkeletonRows } from "@/components/ui/states";
import { STATIC } from "@/services/api";
import { useUi } from "@/stores/ui";

const NAV = [
  { to: "/app", label: "Overview", icon: Strategy, end: true },
  { to: "/app/matches", label: "Match Centre", icon: SoccerBall },
  { to: "/app/players", label: "Player Lab", icon: TShirt },
  { to: "/app/transfers", label: "Transfer Intelligence", icon: SneakerMove },
  { to: "/app/what-if", label: "What-If Lab", icon: ArrowsLeftRight },
  { to: "/app/settings", label: "Settings", icon: Gear },
];

/** Position of the open page in the menu, or -1 for pages outside it. */
const navIndex = (pathname: string) => NAV.findIndex(({ to, end }) => (end ? pathname === to : pathname.startsWith(to)));

function NavList({ onNavigate, layoutId, entrance = false }: { onNavigate?: () => void; layoutId: string; entrance?: boolean }) {
  const { pathname } = useLocation();
  const list = useRef<HTMLUListElement>(null);
  const active = navIndex(pathname);
  return (
    <nav aria-label="Dashboard" className="relative pr-6">
      <span aria-hidden className="absolute inset-y-1 right-[11px] w-0.5 rounded-full bg-white/35" />
      <ul ref={list} className="space-y-0.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `relative flex min-h-10 items-center gap-2.5 rounded-[5px] px-2.5 text-[14px] font-medium transition-colors ${
                  isActive ? "text-[#0f1512]" : "text-white/85 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId={layoutId} aria-hidden className="absolute inset-0 rounded-[5px] bg-white" transition={{ type: "spring", stiffness: 480, damping: 38 }} />}
                  <Icon aria-hidden size={19} weight={isActive ? "fill" : "regular"} className="relative shrink-0" />
                  <span className="relative">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      {active >= 0 && <NavBall list={list} active={active} entrance={entrance} />}
    </nav>
  );
}

const Logo = () => (
  <Link to="/" className="display text-lg normal-case">Pitchside</Link>
);

const TINTS: Record<string, string> = {
  "/app": "tint-mint",
  "/app/matches": "tint-peach",
  "/app/players": "tint-lilac",
  "/app/transfers": "tint-butter",
  "/app/what-if": "tint-rose",
  "/app/models": "tint-sage",
  "/app/data": "tint-periwinkle",
  "/app/settings": "tint-sand",
};

export function DashboardLayout() {
  const { navOpen, setNavOpen } = useUi();
  const { pathname } = useLocation();
  const reduced = useReducedMotion();
  const index = navIndex(pathname);
  const [move, setMove] = useState({ index, from: index });
  if (move.index !== index) setMove({ index, from: move.index });
  const direction = reduced || move.index < 0 || move.from < 0 ? 0 : Math.sign(move.index - move.from);

  useEffect(() => setNavOpen(false), [pathname, setNavOpen]);
  useEffect(() => {
    setScrollLocked(navOpen);
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen, setNavOpen]);

  return (
    <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:bg-accent focus:p-2 focus:text-accent-ink">
        Skip to content
      </a>
      <aside className="grass on-grass sticky top-0 z-20 hidden h-dvh flex-col gap-6 p-3 lg:flex">
        <div className="px-2.5 pt-2"><Logo /></div>
        <div className="flex-1"><NavList layoutId="nav-desktop" entrance /></div>
      </aside>

      <header className="grass on-grass sticky top-0 z-30 flex h-14 items-center justify-between px-4 lg:hidden">
        <Logo />
        <button type="button" aria-label="Open menu" aria-expanded={navOpen} className="-mr-2 p-2" onClick={() => setNavOpen(true)}>
          <List aria-hidden size={24} />
        </button>
      </header>

      <AnimatePresence>
        {navOpen && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            data-lenis-prevent
            className="grass on-grass fixed inset-0 z-40 flex flex-col gap-6 overflow-y-auto p-4 lg:hidden"
            initial={reduced ? { opacity: 0 } : { x: "100%" }}
            animate={reduced ? { opacity: 1 } : { x: 0 }}
            exit={reduced ? { opacity: 0 } : { x: "100%" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" aria-label="Close menu" className="-mr-2 p-2" onClick={() => setNavOpen(false)}>
                <X aria-hidden size={24} />
              </button>
            </div>
            <NavList layoutId="nav-mobile" onNavigate={() => setNavOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`relative min-h-dvh min-w-0 bg-page transition-colors duration-200 ${TINTS[pathname] ?? "tint-mint"}`}>
        <div className="min-h-[63px]"><ScoreStrip /></div>
        <main id="main" className="mx-auto w-full max-w-[76rem] min-w-0 px-4 py-6 text-[15px] sm:px-6 lg:px-8 lg:py-8">
          {STATIC && (
            <p className="mb-4 text-[13px] text-muted">
              Scores, injuries and predictions update every 3 hours. Last update: {import.meta.env.VITE_SNAPSHOT_DATE}.
            </p>
          )}
          <Suspense fallback={<SkeletonRows />}>
            <motion.div key={pathname} {...pageTransition(direction)}>
              <Outlet />
            </motion.div>
          </Suspense>
        </main>
        <SiteFooter className="mx-auto mt-6 w-full max-w-[76rem] px-4 pb-6 text-muted sm:px-6 lg:px-8" />
      </div>
    </div>
  );
}

export function PageTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-[1.9rem]">{title}</h1>
      {intro && <p className="mt-1 max-w-3xl text-muted">{intro}</p>}
    </header>
  );
}
