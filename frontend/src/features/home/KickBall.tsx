import { useRef } from "react";

import { Draggable, gsap, useGSAP } from "@/animations/gsap";
import { prefersReducedMotion } from "@/animations/useReducedMotion";
import { Ball } from "@/components/football/icons";

/** The hero's toy. Click to kick it, or drag it and let go. It always comes home. */
export function KickBall() {
  const root = useRef<HTMLButtonElement>(null);
  const spin = useRef<HTMLSpanElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);

  const { contextSafe } = useGSAP(
    () => {
      if (prefersReducedMotion() || !root.current) return;
      gsap.fromTo(root.current, { scale: 0, y: -260 }, { scale: 1, y: 0, duration: 1.1, delay: 0.9, ease: "bounce.out" });
      const [drag] = Draggable.create(root.current, {
        type: "x,y",
        onDrag() {
          gsap.set(spin.current, { rotation: `+=${this.deltaX * 2}` });
        },
        onDragEnd() {
          const distance = Math.hypot(this.x, this.y);
          gsap.to(root.current, { x: 0, y: 0, duration: Math.min(1.6, 0.7 + distance / 500), ease: "elastic.out(1, 0.55)" });
          gsap.to(spin.current, { rotation: `+=${720}`, duration: 1.2, ease: "power3.out" });
        },
      });
      return () => drag.kill();
    },
    { scope: root },
  );

  const kick = contextSafe(() => {
    if (prefersReducedMotion()) return;
    const x = -gsap.utils.random(180, Math.min(520, window.innerWidth * 0.5));
    gsap.timeline()
      .to(root.current, { x, duration: 0.9, ease: "power2.out" }, 0)
      .to(root.current, { y: -gsap.utils.random(150, 280), duration: 0.42, ease: "power2.out" }, 0)
      .to(root.current, { y: 0, duration: 0.5, ease: "bounce.out" }, 0.42)
      .to(spin.current, { rotation: "-=1080", duration: 1.2, ease: "power2.out" }, 0)
      .to(shadow.current, { scale: 0.45, opacity: 0.2, duration: 0.42, yoyo: true, repeat: 1 }, 0)
      .to(root.current, { x: 0, duration: 1, ease: "power2.inOut" }, 1.05)
      .to(spin.current, { rotation: "+=900", duration: 1, ease: "power2.inOut" }, 1.05);
  });

  return (
    <button ref={root} type="button" onClick={kick} aria-label="Kick the ball" className="kick-ball">
      <span ref={spin} className="block"><Ball size={132} /></span>
      <span ref={shadow} aria-hidden className="kick-shadow" />
    </button>
  );
}
