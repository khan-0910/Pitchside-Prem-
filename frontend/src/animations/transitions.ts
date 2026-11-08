import { DURATION, EASE } from "./presets";

/** A page arrives from the way the ball rolled: from below when moving down the menu, from above going up. */
export const pageTransition = (direction: number) => ({
  initial: { opacity: 0, y: direction * 18 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.quick, ease: EASE } },
  exit: { opacity: 0, transition: { duration: DURATION.quick } },
});
