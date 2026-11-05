import { useRef, type RefObject } from "react";

import { gsap, useGSAP } from "@/animations/gsap";
import { isCoarsePointer, prefersReducedMotion } from "@/animations/useReducedMotion";

/** A full pitch, 105 x 68 scaled by 10. Real proportions, drawn in the order a groundsman would. */
const OUTER = "M30 30H1080V710H30Z";
const HALFWAY = "M555 30V710";
const CIRCLE = "M555 278.5a91.5 91.5 0 1 1 0 183a91.5 91.5 0 1 1 0-183";
const LEFT_BOX = "M30 168.5H195V571.5H30M30 278.5H85V461.5H30M195 311.5A91.5 91.5 0 0 1 195 428.5";
const RIGHT_BOX = "M1080 168.5H915V571.5H1080M1080 278.5H1025V461.5H1080M915 311.5A91.5 91.5 0 0 0 915 428.5";
const MOVE = "M180 560 L395 470 L340 250 L640 300 L790 150 L905 360 L1038 372";
const PLAYERS: [number, number][] = [[180, 560], [395, 470], [340, 250], [640, 300], [790, 150], [905, 360]];

export function PitchScene({ timeline }: { timeline: RefObject<gsap.core.Timeline | null> }) {
  const root = useRef<SVGSVGElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced = prefersReducedMotion();
      const q = gsap.utils.selector(root);
      const lines = q<SVGPathElement>(".line");
      const tl = gsap.timeline({ paused: reduced });

      if (reduced) {
        gsap.set([glow.current, scene.current], { opacity: 1 });
        gsap.set(q(".dot"), { opacity: 1 });
        gsap.set(q(".move"), { opacity: 0.8 });
        return;
      }

      lines.forEach((line) => {
        const length = line.getTotalLength();
        gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
      });
      const move = q<SVGPathElement>(".move")[0];
      const moveLength = move.getTotalLength();
      gsap.set(move, { strokeDasharray: moveLength, strokeDashoffset: moveLength, opacity: 1 });

      tl.to(scene.current, { opacity: 1, duration: 0.6 })
        .to(q(".outer"), { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" }, 0.15)
        .to(q(".box"), { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut", stagger: 0.1 }, 0.5)
        .to(q(".halfway"), { strokeDashoffset: 0, duration: 0.6, ease: "power2.inOut" }, 0.9)
        .to(q(".circle"), { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" }, 1.1)
        .to(glow.current, { opacity: 1, duration: 0.9, ease: "power2.out" }, 1.5);

      timeline.current = tl;

      // The one ambient thing: a passing move that repeats with long rests.
      const dots = q(".dot");
      const play = gsap.timeline({ repeat: -1, repeatDelay: 5, delay: 2.3 });
      play
        .to(dots, { opacity: 1, duration: 0.3, stagger: 0.28 }, 0)
        .to(move, { strokeDashoffset: 0, duration: 2.2, ease: "power1.inOut" }, 0)
        .to(q(".ball"), {
          motionPath: { path: move, align: move, alignOrigin: [0.5, 0.5] },
          duration: 2.2,
          ease: "power1.inOut",
          opacity: 1,
        }, 0)
        .to([move, ...dots, ...q(".ball")], { opacity: 0, duration: 1 }, "+=1.6")
        .set(move, { strokeDashoffset: moveLength, opacity: 1 });

      if (isCoarsePointer()) return;
      gsap.to(root.current, {
        y: 60,
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
      });
    },
    { scope: root },
  );

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      <div
        ref={glow}
        className="absolute inset-0 opacity-0"
        style={{
          background:
            "radial-gradient(60% 45% at 18% 8%, rgb(243 245 239 / 0.13), transparent 70%), radial-gradient(60% 45% at 82% 8%, rgb(243 245 239 / 0.13), transparent 70%), radial-gradient(70% 60% at 50% 70%, rgb(23 77 53 / 0.75), transparent 75%)",
        }}
      />
      <div ref={scene} className="absolute inset-x-0 bottom-[-22%] top-[16%] opacity-0 [perspective:1100px] max-sm:bottom-[-4%] max-sm:top-[38%]">
        <svg
          ref={root}
          viewBox="0 0 1110 740"
          preserveAspectRatio="xMidYMid slice"
          className="h-full w-full [transform:rotateX(52deg)] [transform-origin:50%_60%]"
          fill="none"
        >
          <g stroke="#F3F5EF" strokeOpacity="0.62" strokeWidth="2.4">
            <path className="line outer" d={OUTER} />
            <path className="line box" d={LEFT_BOX} />
            <path className="line box" d={RIGHT_BOX} />
            <path className="line halfway" d={HALFWAY} />
            <path className="line circle" d={CIRCLE} />
          </g>
          <circle cx="555" cy="370" r="4" fill="#F3F5EF" fillOpacity="0.7" />
          {PLAYERS.map(([x, y]) => (
            <circle key={`${x}-${y}`} className="dot opacity-0" cx={x} cy={y} r="9" fill="#071511" stroke="#F3F5EF" strokeWidth="2.4" />
          ))}
          <path className="move opacity-0" d={MOVE} stroke="#B8FF54" strokeWidth="2.6" strokeLinejoin="round" />
          <circle className="ball opacity-0" r="7" fill="#B8FF54" style={{ filter: "drop-shadow(0 0 8px #B8FF54)" }} />
        </svg>
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#071511_6%,transparent_46%,transparent_72%,#071511_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(7_21_17/0.72),transparent_55%)]" />
    </div>
  );
}
