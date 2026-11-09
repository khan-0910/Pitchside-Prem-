import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";

import { gsap, ScrollTrigger, useGSAP } from "@/animations/gsap";
import { prefersReducedMotion } from "@/animations/useReducedMotion";
import { api } from "@/services/api";

/**
 * The players' tunnel. Scrolling walks you down it: the walls slide past, the mouth of light
 * grows until it fills the screen, and the pitch below takes over. The lines on the wall are
 * this season's real numbers.
 */
export function Tunnel() {
  const root = useRef<HTMLElement>(null);
  const standings = useQuery({ queryKey: ["standings"], queryFn: api.standings });
  const table = standings.data?.table ?? [];
  const clubs = table.length;
  const played = table.reduce((sum, r) => sum + r.played, 0) / 2;
  const lines = clubs
    ? [`${clubs} clubs`, `${clubs * (clubs - 1)} matches a season`, `${played} played so far`, "Walk out"]
    : ["Walk out"];

  useGSAP(
    () => {
      if (prefersReducedMotion() || window.innerWidth < 640) return;
      const q = gsap.utils.selector(root);
      gsap.timeline({
        defaults: { ease: "none" },
        // Measured before the pinned sections below, which sit after its spacer.
        scrollTrigger: { trigger: root.current, start: "top top", end: "+=180%", pin: true, scrub: 0.6, refreshPriority: 1 },
      })
        .fromTo(q(".mouth"), { scale: 0.18 }, { scale: 9, ease: "power2.in" }, 0)
        .fromTo(q(".wall-l"), { xPercent: 0 }, { xPercent: -110, ease: "power2.in" }, 0)
        .fromTo(q(".wall-r"), { xPercent: 0 }, { xPercent: 110, ease: "power2.in" }, 0)
        .fromTo(q(".roof"), { yPercent: 0 }, { yPercent: -110, ease: "power2.in" }, 0)
        .from(q(".wall-line"), { opacity: 0, y: 30, stagger: 0.16, duration: 0.12 }, 0.02)
        .to(q(".wall-line"), { opacity: 0, duration: 0.08 }, 0.78)
        .to(q(".glow"), { opacity: 0, duration: 0.3 }, 0.7);
      ScrollTrigger.refresh();
    },
    { scope: root, dependencies: [lines.length], revertOnUpdate: true },
  );

  return (
    <section ref={root} aria-label="Walking out of the tunnel" className="relative h-dvh overflow-hidden bg-[#070b09] text-white max-sm:h-auto max-sm:py-16">
      <div aria-hidden className="mouth grass absolute left-1/2 top-1/2 -ml-[50vw] -mt-[50vh] size-full rounded-[3vw] max-sm:hidden">
        <div className="glow absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 30%, rgb(255 253 235 / 0.35), transparent 60%)" }} />
      </div>
      <div aria-hidden className="wall-l absolute inset-y-0 left-0 w-1/2 max-sm:hidden"
        style={{ background: "linear-gradient(90deg, #050806 0%, #121a15 70%, transparent 100%)", clipPath: "polygon(0 0, 100% 30%, 100% 70%, 0 100%)" }} />
      <div aria-hidden className="wall-r absolute inset-y-0 right-0 w-1/2 max-sm:hidden"
        style={{ background: "linear-gradient(270deg, #050806 0%, #121a15 70%, transparent 100%)", clipPath: "polygon(0 30%, 100% 0, 100% 100%, 0 70%)" }} />
      <div aria-hidden className="roof absolute inset-x-0 top-0 h-[30%] max-sm:hidden"
        style={{ background: "linear-gradient(180deg, #050806, transparent)" }} />
      <ul className="relative z-10 flex h-full flex-col items-center justify-center gap-3 text-center">
        {lines.map((line, i) => (
          <li key={line} className={`wall-line display text-[clamp(1.6rem,4.4vw,4.2rem)] ${i === lines.length - 1 ? "text-[#ffd400]" : ""}`}>
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
