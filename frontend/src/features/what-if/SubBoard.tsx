import { motion } from "framer-motion";
import { ArrowDown, ArrowUp } from "lucide-react";

import { useReducedMotion } from "@/animations/useReducedMotion";

/** The fourth official's board, flipping up when a swap is applied. */
export function SubBoard({ out, into }: { out: string; into: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { rotateX: -90, opacity: 0 }}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 190, damping: 13 }}
      style={{ transformOrigin: "top" }}
      className="sub-board"
      role="img"
      aria-label={`Substitution: ${out} off, ${into} on`}
    >
      <p className="flex items-center gap-2 text-alert"><ArrowDown aria-hidden className="size-7 shrink-0" /><span className="truncate">{out}</span></p>
      <p className="flex items-center gap-2 text-volt"><ArrowUp aria-hidden className="size-7 shrink-0" /><span className="truncate">{into}</span></p>
    </motion.div>
  );
}
