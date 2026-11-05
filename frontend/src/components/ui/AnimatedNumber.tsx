import { animate } from "framer-motion";
import { useEffect, useRef } from "react";

import { DURATION, EASE } from "@/animations/presets";
import { useReducedMotion } from "@/animations/useReducedMotion";

interface Props {
  value: number;
  format?: (value: number) => string;
  className?: string;
}

/** Counts from its previous value, writing to the DOM directly so React never re-renders per frame. */
export function AnimatedNumber({ value, format = (v) => v.toFixed(0), className = "" }: Props) {
  const node = useRef<HTMLSpanElement>(null);
  const previous = useRef(0);
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
