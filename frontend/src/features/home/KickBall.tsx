import { useRef, type RefObject } from "react";

import { gsap, useGSAP } from "@/animations/gsap";
import { Draggable } from "@/animations/home-plugins";
import { prefersReducedMotion } from "@/animations/useReducedMotion";
import { Ball } from "@/components/football/icons";

/** Sits on the centre spot. Click to knock it about, or drag it. The team shape follows it. */
export function KickBall({ position }: { position: RefObject<{ x: number; y: number }> }) {
  const root = useRef<HTMLButtonElement>(null);
  const spin = useRef<HTMLSpanElement>(null);

  const follow = () => {
    position.current.x = Number(gsap.getProperty(root.current, "x"));
    position.current.y = Number(gsap.getProperty(root.current, "y"));
  };

  const { contextSafe } = useGSAP(
    () => {
      if (prefersReducedMotion() || !root.current) return;
      const [drag] = Draggable.create(root.current, {
        type: "x,y",
        bounds: { minX: -560, maxX: 560, minY: -320, maxY: 170 },
        onDrag() {
          gsap.set(spin.current, { rotation: `+=${this.deltaX * 1.6 + this.deltaY}` });
          follow();
        },
        onDragEnd() {
          gsap.to(root.current, { x: 0, y: 0, duration: 1.1, ease: "power3.inOut", onUpdate: follow });
          gsap.to(spin.current, { rotation: "+=540", duration: 1.1, ease: "power3.inOut" });
        },
      });
      return () => drag.kill();
    },
    { scope: root },
  );

  const kick = contextSafe(() => {
    if (prefersReducedMotion() || gsap.isTweening(root.current)) return;
    const x = gsap.utils.random(240, 460) * gsap.utils.random([-1, 1]);
    const y = gsap.utils.random(-220, 90);
    gsap.timeline({ onUpdate: follow })
      .to(root.current, { x, y, duration: 0.8, ease: "power3.out" }, 0)
      .to(spin.current, { rotation: `+=${x * 2.2}`, duration: 0.8, ease: "power3.out" }, 0)
      .to(root.current, { x: 0, y: 0, duration: 1, ease: "power2.inOut" }, 1)
      .to(spin.current, { rotation: "+=0", duration: 0.01 }, 2);
  });

  return (
    <button ref={root} type="button" onClick={kick} aria-label="Kick the ball" className="kick-ball">
      <span ref={spin} className="block"><Ball size={74} /></span>
    </button>
  );
}
