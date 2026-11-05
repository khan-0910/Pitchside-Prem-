import { Ball } from "./icons";

/** Loading state: a ball running up and down the touchline. */
export function BallLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="ball-track">
      <span className="ball-runner"><span className="spin-fast block"><Ball size={22} /></span></span>
    </div>
  );
}
