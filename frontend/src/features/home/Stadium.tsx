const FLASHES = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 47 + 3) % 100}%`,
  top: `${(i * 19) % 80}%`,
  delay: `${(i * 1.3) % 7}s`,
}));

function Floodlight({ side }: { side: "left" | "right" }) {
  const mirrored = side === "right";
  return (
    <div className={`absolute top-0 ${mirrored ? "right-[3%] -scale-x-100" : "left-[3%]"} max-sm:hidden`}>
      <div className="beam" />
      <svg width="130" height="86" viewBox="0 0 130 86" className="relative">
        <path d="M112 84 96 30h8l16 54z" fill="#0B2018" stroke="#F3F5EF" strokeOpacity="0.25" />
        <rect x="42" y="2" width="72" height="30" rx="2" fill="#0B2018" stroke="#F3F5EF" strokeOpacity="0.35" transform="rotate(-8 78 17)" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle key={i} cx={52 + i * 11} cy={i % 2 ? 22 - i : 12 - i} r="3.6" fill="#F3F5EF" className="lamp" />
        ))}
      </svg>
    </div>
  );
}

/** The ground: stands packed with people, camera flashes and floodlights swinging over the pitch. */
export function Stadium() {
  return (
    <div aria-hidden className="absolute inset-x-0 top-0 h-[46%]">
      <div className="stands absolute inset-x-0 top-0 h-full" />
      <div className="absolute inset-x-0 top-0 h-full motion-reduce:hidden">
        {FLASHES.map((f, i) => (
          <span key={i} className={`flash ${i % 2 ? "max-sm:hidden" : ""}`} style={{ left: f.left, top: f.top, animationDelay: f.delay }} />
        ))}
      </div>
      <Floodlight side="left" />
      <Floodlight side="right" />
    </div>
  );
}
