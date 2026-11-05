import { useId, type ComponentType } from "react";

/** Hand-drawn generic kit. No club crests, no league marks, no sponsor shapes. */
export interface IconProps {
  size?: number;
  className?: string;
}

const svg = (size: number | undefined, className: string | undefined) => ({
  width: size ?? 24,
  height: size ?? 24,
  viewBox: "0 0 32 32",
  className,
  "aria-hidden": true,
  fill: "currentColor",
});

const at = (radius: number, degrees: number) => {
  const a = (degrees * Math.PI) / 180;
  return `${(32 + radius * Math.cos(a)).toFixed(2)},${(32 + radius * Math.sin(a)).toFixed(2)}`;
};
const ANGLES = [0, 1, 2, 3, 4].map((k) => -90 + 72 * k);
const CENTRE = ANGLES.map((a) => at(11, a)).join(" ");

export function Ball({ size = 24, className }: IconProps) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <clipPath id={`${id}c`}><circle cx="32" cy="32" r="30" /></clipPath>
        <radialGradient id={`${id}g`} cx="36%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.5" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="#F3F5EF" />
      <g clipPath={`url(#${id}c)`} fill="#0B2018" stroke="#0B2018" strokeWidth="1.6" strokeLinejoin="round">
        <polygon points={CENTRE} />
        {ANGLES.map((a) => {
          const b = a + 36;
          return (
            <g key={a}>
              <polyline fill="none" points={`${at(11, a)} ${at(19, a)} ${at(25, a + 16)}`} />
              <polyline fill="none" points={`${at(19, a)} ${at(25, a - 16)}`} />
              <polygon points={`${at(25, b - 20)} ${at(21, b)} ${at(25, b + 20)} ${at(34, b + 24)} ${at(34, b - 24)}`} />
            </g>
          );
        })}
      </g>
      <circle cx="32" cy="32" r="30" fill={`url(#${id}g)`} />
    </svg>
  );
}

export const Boot = ({ size, className }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M3 19c0-2 1-3 3-3 4 0 6-2 8-5l2-5 8 2c-1 3 0 6 2 7 3 1 5 2 5 5 0 1-1 2-3 2H6c-2 0-3-1-3-3z" />
    <path d="M6 24h3l-1 4H6zM13 24h3l-1 4h-2zM20 24h3l-1 4h-2zM26 24h2l-1 3h-1z" />
  </svg>
);

export const Whistle = ({ size, className }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M13 9h17v6h-6v1a10 10 0 1 1-11-7z" />
    <circle cx="13" cy="19" r="3.4" fill="var(--color-page)" />
    <path d="M9 5h3v4H9z" />
  </svg>
);

export const Trophy = ({ size, className }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M9 3h14v9a7 7 0 0 1-14 0z" />
    <path d="M9 6H4c0 6 2 9 6 10M23 6h5c0 6-2 9-6 10" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <path d="M14 19h4v5h3v3H11v-3h3z" />
    <path d="M9 27h14v2H9z" />
  </svg>
);

export const Shirt = ({ size, className }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M11 4 5 7 1 14l5 3 3-2v14h14V15l3 2 5-3-4-7-6-3c-1 2-3 3-5 3s-4-1-5-3z" />
  </svg>
);

export const CornerFlag = ({ size, className }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M9 3h2v26H9z" />
    <path d="M11 4l13 5-13 6z" />
    <path d="M2 21a15 15 0 0 1 8 8" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M2 29h28" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const RefCard = ({ size, className }: IconProps) => (
  <svg {...svg(size, className)}>
    <rect x="8" y="4" width="16" height="24" rx="2.5" transform="rotate(12 16 16)" />
  </svg>
);

export const Stopwatch = ({ size, className }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M13 2h6v3h-2v2a11 11 0 1 1-2 0V5h-2z" />
    <path d="M16 11v7l5 3" fill="none" stroke="var(--color-page)" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

export const Cone = ({ size, className }: IconProps) => (
  <svg {...svg(size, className)}>
    <path d="M16 3l9 22H7z" />
    <path d="M3 25h26v3H3z" />
    <path d="M12 14h8l1 3H11z" fill="var(--color-page)" />
  </svg>
);

export const TacticsBoard = ({ size, className }: IconProps) => (
  <svg {...svg(size, className)} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <rect x="3" y="5" width="26" height="22" rx="2" />
    <path d="M8 11l4 4M12 11l-4 4" />
    <circle cx="23" cy="21" r="2.5" />
    <path d="M11 21c4 0 8-2 10-8m0 0-3 1m3-1 1 3" />
  </svg>
);

export const GOODS: ComponentType<IconProps>[] = [Ball, Boot, Whistle, Trophy, Shirt, CornerFlag, RefCard, Stopwatch, Cone];
