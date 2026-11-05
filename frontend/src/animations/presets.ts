/** Shared timings. One motion language: fast off the mark, soft landing. */
export const EASE = [0.16, 1, 0.3, 1] as const;
export const DURATION = { quick: 0.18, base: 0.35, slow: 0.7, count: 0.9 };

export const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE } },
};

export const stagger = (gap = 0.05) => ({
  hidden: {},
  show: { transition: { staggerChildren: gap } },
});
