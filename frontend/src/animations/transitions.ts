import { DURATION, EASE } from "./presets";

export const pageTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.page, ease: EASE } },
  exit: { opacity: 0, transition: { duration: DURATION.quick } },
};
