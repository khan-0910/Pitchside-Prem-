import { useRef } from "react";
import { Link } from "react-router-dom";

import { gsap, ScrollTrigger, useGSAP } from "@/animations/gsap";
import { prefersReducedMotion } from "@/animations/useReducedMotion";
import { Ball } from "@/components/football/icons";

const CONFETTI = Array.from({ length: 34 }, (_, i) => i);

/** The move ends in a goal: the ball flies in, the net bulges, the paper comes down. */
export function GoalFinale() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      if (prefersReducedMotion()) {
        gsap.set(q(".final-ball"), { xPercent: 0, left: "68%", top: "30%" });
        return;
      }
      gsap.set(q(".paper"), { opacity: 0 });
      const score = () => {
        const tl = gsap.timeline();
        tl.fromTo(q(".final-ball"),
          { left: "2%", top: "92%", scale: 1.5, rotation: 0 },
          { left: "68%", top: "26%", scale: 0.8, rotation: 1100, duration: 0.95, ease: "power2.in" })
          .to(q(".net"), { scaleY: 1.07, scaleX: 1.04, y: -14, duration: 0.14, ease: "power2.out" })
          .to(q(".net"), { scaleY: 1, scaleX: 1, y: 0, duration: 1.1, ease: "elastic.out(1, 0.25)" })
          .to(q(".final-ball"), { top: "80%", duration: 0.5, ease: "bounce.out" }, "-=1.05")
          .fromTo(q(".goal-word"), { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2.4)" }, "<-0.2");
        q(".paper").forEach((paper: Element) => {
          gsap.fromTo(paper,
            { opacity: 1, x: 0, y: 0, rotation: 0 },
            {
              x: gsap.utils.random(-260, 260),
              y: gsap.utils.random(120, 420),
              rotation: gsap.utils.random(-540, 540),
              opacity: 0,
              duration: gsap.utils.random(1.6, 3),
              delay: 1,
              ease: "power1.out",
            });
        });
      };
      ScrollTrigger.create({ trigger: root.current, start: "top 55%", once: true, onEnter: score });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="relative z-10 grid min-h-dvh items-center gap-8 overflow-hidden px-4 py-16 sm:px-8 lg:grid-cols-2 lg:px-24">
      <div>
        <h2 data-pass className="text-[clamp(3.6rem,10vw,10rem)] leading-[0.88]">SEE THE GAME DIFFERENTLY.</h2>
        <Link to="/app" className="btn-primary mt-7">Open the dashboard</Link>
      </div>
      <div aria-hidden className="relative h-[46vh] min-h-72">
        <svg viewBox="0 0 520 300" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid meet" fill="none">
          <defs>
            <pattern id="net-mesh" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <path d="M0 0H20M0 0V20" stroke="#F3F5EF" strokeOpacity="0.4" />
            </pattern>
          </defs>
          <g className="net" style={{ transformOrigin: "260px 290px" }}>
            <path d="M34 22H486L510 290H10z" fill="url(#net-mesh)" />
          </g>
          <path d="M28 290V16H492V290" stroke="#F3F5EF" strokeWidth="9" strokeLinejoin="round" />
          <path d="M0 292H520" stroke="#F3F5EF" strokeOpacity="0.6" strokeWidth="2" />
        </svg>
        <p className="goal-word absolute inset-x-0 top-[34%] text-center font-display text-[clamp(3rem,8vw,6.5rem)] font-black text-volt opacity-0 motion-reduce:opacity-100">GOAL</p>
        {CONFETTI.map((i) => (
          <span
            key={i}
            className="paper absolute left-[60%] top-[28%] h-3 w-1.5 opacity-0"
            style={{ background: i % 3 === 0 ? "#B8FF54" : i % 3 === 1 ? "#D6AD56" : "#F3F5EF" }}
          />
        ))}
        <span className="final-ball absolute -ml-7 -mt-7 block" style={{ left: "2%", top: "92%" }}><Ball size={56} /></span>
      </div>
    </section>
  );
}
