import Lenis from "lenis";

import { gsap, ScrollTrigger } from "./gsap";

let lenis: Lenis | null = null;
let users = 0;
const tick = (time: number) => lenis?.raf(time * 1000);

/** One shared instance driven by the GSAP ticker. Counted, so Strict Mode's double mount is safe. */
export function acquireLenis(): () => void {
  users += 1;
  if (!lenis) {
    lenis = new Lenis({ lerp: 0.12, anchors: { offset: -72 }, stopInertiaOnNavigate: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
  }
  return () => {
    users -= 1;
    if (users === 0 && lenis) {
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenis = null;
    }
  };
}

export function scrollToTop(): void {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
  else window.scrollTo(0, 0);
}

export function scrollToTarget(target: string): void {
  if (lenis) lenis.scrollTo(target, { offset: -72 });
  else document.querySelector(target)?.scrollIntoView();
}

export function setScrollLocked(locked: boolean): void {
  if (locked) lenis?.stop();
  else lenis?.start();
}
