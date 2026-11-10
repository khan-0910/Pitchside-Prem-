import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Link } from "react-router-dom";

import { gsap, useGSAP } from "@/animations/gsap";
import { scrollToTarget } from "@/animations/lenis";
import { prefersReducedMotion } from "@/animations/useReducedMotion";
import { StatusPill } from "@/components/ui/StatusPill";
import { timeAgo } from "@/lib/format";
import { api } from "@/services/api";

import Magnet from "@/components/reactbits/Magnet";

import { FixtureBoard } from "./FixtureBoard";
import { Floodlights } from "./Floodlights";
import { KickBall } from "./KickBall";
import { TeamShape } from "./TeamShape";

const HEADLINE = ["THE GAME HAS", "A DATA SIDE."];

function LiveMark() {
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.dataSources });
  const fpl = sources.data?.find((s) => s.source_id === "fpl");
  if (!fpl) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm">
      <StatusPill status={fpl.status} />
      <span className="text-muted">Premier League data checked {timeAgo(fpl.last_success_at).toLowerCase()}</span>
    </p>
  );
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const ball = useRef({ x: 0, y: 0 });
  const spot = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      if (prefersReducedMotion()) return;
      const lines = q<SVGGeometryElement>(".chalk-line");
      lines.forEach((line) => {
        const length = line.getTotalLength();
        gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
      });
      // The chalk goes down once the floodlights are up.
      gsap.timeline({ delay: 1.15 })
        .to(lines, { strokeDashoffset: 0, duration: 1, stagger: 0.12, ease: "power2.inOut" }, 0)
        .from(q(".intro"), { y: 14, opacity: 0, duration: 0.55, stagger: 0.09 }, 0.15)
        .from(spot.current, { scale: 0, duration: 0.7, ease: "back.out(2.2)" }, 0.5);

      // Scrolling plays the ball forward out of the circle and down the pitch.
      gsap.to(spot.current, {
        y: () => window.innerHeight * 0.3,
        rotation: 240,
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: 0.5 },
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="grass on-grass relative flex min-h-dvh flex-col overflow-hidden" aria-labelledby="hero-title">
      <svg aria-hidden viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full" fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="3.5">
        <path className="chalk-line" d="M56 -10V910" />
        <path className="chalk-line" d="M1544 -10V910" />
        <path className="chalk-line" d="M56 690H1544" />
        <circle className="chalk-line" cx="800" cy="690" r="170" />
        <circle cx="800" cy="690" r="7" fill="#fff" stroke="none" />
      </svg>
      <Floodlights />
      <TeamShape ball={ball} />

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-[5.5vw]">
        <span className="display text-xl normal-case">Pitchside</span>
        <Link to="/app" className="btn-ghost !border-white/70 hover:bg-white hover:!text-[#0f1512]">Open the dashboard</Link>
      </header>

      <div className="relative z-10 flex flex-1 flex-col px-5 pb-8 sm:px-[5.5vw]">
        {/* index.html paints this same headline before any script loads, so it never animates in. */}
        <h1 id="hero-title" aria-label="The game has a data side." className="display mt-[2vh] text-[clamp(2.5rem,8.15vw,10rem)]">
          {HEADLINE.map((line) => (
            <span key={line} aria-hidden className="block overflow-hidden pb-[0.06em] pr-[0.08em]">
              <span className="word block whitespace-nowrap max-sm:whitespace-normal">{line}</span>
            </span>
          ))}
        </h1>
        <div className="mt-7 max-w-[24rem]">
          <p className="intro text-lg font-medium leading-snug">Understand the Premier League beyond the scoreline</p>
          <div className="intro mt-4 flex flex-wrap gap-2.5">
            <Magnet padding={60} magnetStrength={3} disabled={prefersReducedMotion()}><Link to="/app" className="btn-primary">Explore Pitchside</Link></Magnet>
            <button type="button" className="btn-ghost !border-white/70 hover:bg-white hover:!text-[#0f1512]" onClick={() => scrollToTarget("#intelligence")}>
              Explore the Intelligence
            </button>
          </div>
          <div className="intro mt-3 min-h-6"><LiveMark /></div>
          <div className="intro mt-6"><FixtureBoard /></div>
        </div>
      </div>

      <div ref={spot} className="absolute left-1/2 top-[76.7%] z-20 -ml-[37px] -mt-[37px] max-sm:top-[74%]">
        <KickBall position={ball} />
      </div>
    </section>
  );
}
