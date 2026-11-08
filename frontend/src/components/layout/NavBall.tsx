import { motion } from "framer-motion";
import { useLayoutEffect, useState, type RefObject } from "react";

import { EASE } from "@/animations/presets";
import { useReducedMotion } from "@/animations/useReducedMotion";
import { Ball } from "@/components/football/icons";

const SIZE = 18;
const ENTRY = -64; // above the first item, by the logo
const ROLL_S = 0.5;
// A rolling ball turns once for every circumference it travels.
const turns = (y: number) => (y / (Math.PI * SIZE)) * 360;

/** The ball rolls along the touchline beside the menu to whichever page is open. */
export function NavBall({ list, active, entrance }: {
  list: RefObject<HTMLUListElement | null>;
  active: number;
  entrance: boolean;
}) {
  const reduced = useReducedMotion();
  const [y, setY] = useState<number | null>(null);

  useLayoutEffect(() => {
    const item = list.current?.children[active] as HTMLElement | undefined;
    setY(item ? item.offsetTop + item.offsetHeight / 2 - SIZE / 2 : null);
  }, [list, active]);

  if (y === null) return null;
  return (
    <motion.span
      aria-hidden
      data-testid="nav-ball"
      className="pointer-events-none absolute right-[3px] top-0"
      style={{ width: SIZE, height: SIZE }}
      initial={entrance && !reduced ? { y: ENTRY, rotate: turns(ENTRY), opacity: 0 } : false}
      animate={{ y, rotate: turns(y), opacity: 1 }}
      transition={reduced ? { duration: 0 } : { duration: ROLL_S, ease: EASE }}
    >
      <Ball size={SIZE} />
    </motion.span>
  );
}
