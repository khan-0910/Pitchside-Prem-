import { animate } from "framer-motion";
import { useEffect, useRef } from "react";

import { DURATION, EASE } from "@/animations/presets";
import { useReducedMotion } from "@/animations/useReducedMotion";

interface Props {
  value: number;
  format?: (value: number) => string;
  className?: string;
  /** false shows the first value as it is, and only counts later changes. */
  countIn?: boolean;
}

// Module level, so the default keeps one identity and a re-render never restarts the count.
const whole = (v: number) => v.toFixed(0);

/** Counts from its previous value, writing to the DOM directly so React never re-renders per frame. */
export function AnimatedNumber({ value, format = whole, className = "", countIn = true }: Props) {
  const node = useRef<HTMLSpanElement>(null);
  const previous = useRef(countIn ? 0 : value);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = node.current;
    if (!el) return;
    if (reduced) {
      el.textContent = format(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: DURATION.count,
      ease: EASE,
      onUpdate: (v) => {
        el.textContent = format(v);
      },
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, format, reduced]);

  return (
    <span ref={node} className={`num ${className}`} aria-label={format(value)}>
      {format(value)}
    </span>
  );
}
