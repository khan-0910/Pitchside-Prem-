import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Link } from "react-router-dom";

import { gsap, useGSAP } from "@/animations/gsap";
import { scrollToTarget } from "@/animations/lenis";
import { prefersReducedMotion } from "@/animations/useReducedMotion";
import { FloatingIcons } from "@/components/football/FloatingIcons";
import { StatusPill } from "@/components/ui/StatusPill";
import { timeAgo } from "@/lib/format";
import { api } from "@/services/api";

import { KickBall } from "./KickBall";
import { PitchScene } from "./PitchScene";

const HEADLINE = ["THE GAME", "HAS A", "DATA SIDE."];

function Particles() {
  // Floodlight haze. CSS only, hidden for reduced motion, fewer on phones.
  const dots = Array.from({ length: 26 }, (_, i) => ({
    left: `${(i * 37) % 100}%`,
    top: `${(i * 23) % 62}%`,
    delay: `${(i * 1.7) % 9}s`,
    duration: `${11 + (i % 7)}s`,
  }));
  return (
    <div aria-hidden className="absolute inset-0 motion-reduce:hidden">
      <style>{`@keyframes haze{0%,100%{opacity:0;transform:translate3d(0,0,0)}50%{opacity:.5;transform:translate3d(10px,-26px,0)}}`}</style>
      {dots.map((d, i) => (
        <span
          key={i}
          className={`absolute size-[3px] rounded-full bg-flood ${i % 3 ? "max-sm:hidden" : ""}`}
          style={{ left: d.left, top: d.top, opacity: 0, animation: `haze ${d.duration} ${d.delay} infinite ease-in-out` }}
        />
      ))}
    </div>
  );
}

function LiveMark() {
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.dataSources });
  const fpl = sources.data?.find((s) => s.source_id === "fpl");
  if (!fpl) return null;
  return (
    <p className="flex items-center gap-2 text-sm">
      <StatusPill status={fpl.status} />
      <span className="text-muted">Premier League data, checked {timeAgo(fpl.last_success_at).toLowerCase()}</span>
    </p>
  );
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);

  const timeline = useRef<gsap.core.Timeline | null>(null);

  // Runs after PitchScene's effect, so its timeline exists and this section's refs are attached.
  useGSAP(
    () => {
      const q = gsap.utils.selector(copy);
      if (prefersReducedMotion() || !timeline.current) {
        gsap.set(q(".word"), { yPercent: 0 });
        gsap.set(q(".intro"), { opacity: 1, y: 0 });
        return;
      }
      timeline.current
        .fromTo(q(".word"), { yPercent: 110 }, { yPercent: 0, duration: 0.8, stagger: 0.09, ease: "power4.out" }, 0.7)
        .fromTo(q(".intro"), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.12 }, 1.25);
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative flex min-h-dvh flex-col justify-end overflow-hidden" aria-labelledby="hero-title">
      <PitchScene timeline={timeline} />
      <Particles />
      <FloatingIcons count={14} strength={1.5} mouse className="absolute inset-0 z-[5]" />
      <KickBall />
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-4 sm:px-8">
        <span className="font-display text-2xl font-black tracking-wide">Pitchside</span>
        <Link to="/app" className="btn-ghost">
          Open the dashboard
        </Link>
      </header>
      <div ref={copy} className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-14 sm:px-8 sm:pb-20">
        <h1 id="hero-title" className="text-[clamp(4rem,min(15.5vw,23vh),13.5rem)] leading-[0.86] tracking-[0.002em]" aria-label="The game has a data side.">
          {HEADLINE.map((line) => (
            <span key={line} aria-hidden className="block overflow-hidden pb-[0.04em]">
              <span className="word block">
                {line}
              </span>
            </span>
          ))}
        </h1>
        <p className="intro mt-5 max-w-xl text-xl">Understand the Premier League beyond the scoreline.</p>
        <div className="intro mt-6 flex flex-wrap gap-3">
          <Link to="/app" className="btn-primary">
            Explore Pitchside
          </Link>
          <button type="button" className="btn-ghost" onClick={() => scrollToTarget("#intelligence")}>
            Explore the Intelligence
          </button>
        </div>
        <div className="intro mt-6 min-h-6">
          <LiveMark />
        </div>
      </div>
    </section>
  );
}
