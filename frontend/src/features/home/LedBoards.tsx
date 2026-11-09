import { useQuery } from "@tanstack/react-query";

import { useReducedMotion } from "@/animations/useReducedMotion";
import { ScrollVelocity } from "@/components/reactbits/ScrollVelocity";
import { api } from "@/services/api";

/**
 * The advertising boards around a pitch, carrying the latest real results instead of ads.
 * They run faster and lean while you scroll, like a camera panning along the touchline.
 */
export function LedBoards() {
  const reduced = useReducedMotion();
  const results = useQuery({ queryKey: ["results", "ticker"], queryFn: () => api.results({ limit: 10 }) });
  const items = results.data?.items ?? [];
  if (items.length === 0) return null;
  const line = items.map((f) => `${f.home_tla} ${f.home_goals}-${f.away_goals} ${f.away_tla}`).join("   •   ");
  return (
    <section aria-label={`Latest results: ${items.map((f) => `${f.home_short} ${f.home_goals}, ${f.away_short} ${f.away_goals}`).join("; ")}`}
      className="border-y-4 border-[#1b1f1d] bg-[#050706] py-2">
      {reduced ? (
        <p aria-hidden className="led overflow-hidden whitespace-nowrap px-4 text-[clamp(1.1rem,2.2vw,1.9rem)]">{line}</p>
      ) : (
        <div aria-hidden>
          <ScrollVelocity
            texts={[line]}
            velocity={40}
            numCopies={4}
            separator={<span className="px-6">•</span>}
            skewWithVelocity={6}
            fontSize="clamp(1.1rem, 2.2vw, 1.9rem)"
            fontWeight={800}
            color="#ffd400"
            className="led"
          />
        </div>
      )}
    </section>
  );
}
