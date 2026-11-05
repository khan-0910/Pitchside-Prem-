import { useRef } from "react";
import { Link } from "react-router-dom";

import { gsap, ScrollTrigger, useGSAP } from "@/animations/gsap";
import { prefersReducedMotion } from "@/animations/useReducedMotion";
import { Ball } from "@/components/football/icons";

const CONFETTI = Array.from({ length: 36 }, (_, i) => i);

/** The goal line. Penalty box from above, the ball struck from the spot, the net takes it. */
export function GoalFinale() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      if (prefersReducedMotion()) return;
      gsap.set(q(".paper"), { opacity: 0 });
      const score = () => {
        const target = q(".goal-net")[0].getBoundingClientRect();
        const start = q(".strike")[0].getBoundingClientRect();
        const drop = target.top + target.height * 0.62 - start.top;
        gsap.timeline()
          .to(q(".strike"), { y: drop, x: 90, rotation: 720, scale: 0.8, duration: 0.55, ease: "power3.in" })
          .to(q(".goal-net"), { scaleY: 1.32, duration: 0.13, ease: "power2.out" })
          .to(q(".strike"), { y: drop + 26, duration: 0.13, ease: "power2.out" }, "<")
          .to(q(".goal-net"), { scaleY: 1, duration: 1.1, ease: "elastic.out(1.1, 0.22)" })
          .to(q(".strike"), { y: drop - 6, duration: 0.5, ease: "power2.out" }, "<");
        q(".paper").forEach((paper: Element) => {
          gsap.fromTo(paper,
            { opacity: 1, x: 0, y: 0, rotation: 0 },
            {
              x: gsap.utils.random(-340, 340),
              y: gsap.utils.random(-420, -120),
              rotation: gsap.utils.random(-620, 620),
              opacity: 0,
              duration: gsap.utils.random(1.5, 2.6),
              delay: 0.55,
              ease: "power2.out",
            });
        });
      };
      ScrollTrigger.create({ trigger: root.current, start: "top 35%", once: true, onEnter: score });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="on-grass relative z-10 flex min-h-[112dvh] flex-col items-center justify-end overflow-hidden pt-16">
      <div aria-hidden className="absolute bottom-[86px] left-1/2 h-[66dvh] w-[min(1080px,88vw)] -translate-x-1/2 border-x-[3.5px] border-t-[3.5px] border-white">
        <div className="absolute -top-[92px] left-1/2 h-[92px] w-[300px] -translate-x-1/2 overflow-hidden max-sm:hidden">
          <div className="absolute left-0 top-0 h-[184px] w-[300px] rounded-[50%] border-[3.5px] border-white" />
        </div>
        <div className="absolute bottom-0 left-1/2 h-[28%] w-[46%] -translate-x-1/2 border-x-[3.5px] border-t-[3.5px] border-white" />
      </div>
      <div className="relative z-10 mb-[13dvh] flex w-[min(960px,84vw)] flex-col items-center text-center">
        <h2 data-pass className="display text-[clamp(2.4rem,7vw,6.5rem)]">SEE THE GAME DIFFERENTLY.</h2>
        <Link to="/app" className="btn-primary mt-6">Open the dashboard</Link>
        <span aria-hidden className="strike relative mt-7 block"><span className="block" style={{ filter: "drop-shadow(0 8px 6px rgb(0 40 20 / .5))" }}><Ball size={44} /></span></span>
      </div>
      <div aria-hidden className="relative w-full">
        <div className="absolute inset-x-0 top-0 h-[3.5px] bg-white" />
        <div className="relative mx-auto h-[86px] w-[min(430px,60vw)]">
          <div className="goal-net net absolute inset-0 origin-top bg-black/25" />
          <div className="absolute inset-x-[-6px] top-0 h-[7px] rounded-sm bg-white" />
          <div className="absolute inset-y-0 -left-1.5 w-[3px] bg-white/80" />
          <div className="absolute inset-y-0 -right-1.5 w-[3px] bg-white/80" />
        </div>
        {CONFETTI.map((i) => (
          <span key={i} className="paper absolute left-1/2 top-2 h-3 w-1.5" style={{ background: i % 3 === 0 ? "#FFD400" : i % 3 === 1 ? "#FFFFFF" : "#E0262B" }} />
        ))}
      </div>
    </section>
  );
}
