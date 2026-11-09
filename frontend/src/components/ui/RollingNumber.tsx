import { useReducedMotion } from "@/animations/useReducedMotion";
import Counter from "@/components/reactbits/Counter";

interface Props {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}

/** Stadium scoreboard digits that roll to each new value. Plain text when motion is off in Settings. */
export function RollingNumber({ value, decimals = 0, suffix, className = "" }: Props) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={`num ${className}`}>{value.toFixed(decimals)}{suffix}</span>;
  return <Counter value={value} decimals={decimals} suffix={suffix} fontSize="1em" fontWeight="inherit" className={className} />;
}
