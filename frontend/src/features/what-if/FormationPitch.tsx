import { motion } from "framer-motion";

import { useReducedMotion } from "@/animations/useReducedMotion";
import { ShirtGraphic } from "@/components/football/ShirtCard";
import { initials } from "@/lib/format";
import type { SquadPlayer } from "@/types/api";

const LINE: Record<string, number> = { GK: 0, CB: 1, FB: 1, DM: 2, CM: 2, AM: 2, W: 3, ST: 3 };
const COARSE: Record<string, number> = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Forward: 3 };
const lineOf = (p: SquadPlayer) => LINE[p.position_group ?? ""] ?? COARSE[p.position ?? ""] ?? 2;

/** The club's most-used eleven in rough lines. A best guess from minutes, never a confirmed team. */
export function pickEleven(players: SquadPlayer[]): SquadPlayer[][] {
  const pool = players.filter((p) => p.in_likely_14);
  const keeper = pool.find((p) => lineOf(p) === 0);
  const outfield = pool.filter((p) => lineOf(p) !== 0).slice(0, keeper ? 10 : 11);
  return [keeper ? [keeper] : [], ...[1, 2, 3].map((line) => outfield.filter((p) => lineOf(p) === line))];
}

interface Props {
  players: SquadPlayer[];
  picked: string | null;
  incoming: { name: string } | null;
  tla: string;
  onPick: (player: SquadPlayer) => void;
}

export function FormationPitch({ players, picked, incoming, tla, onPick }: Props) {
  const lines = pickEleven(players);
  const reduced = useReducedMotion();
  return (
    <figure className="m-0">
      <div className="relative aspect-[68/105] w-full overflow-hidden rounded-md border border-flood/30 bg-[repeating-linear-gradient(180deg,#1b5a3e_0_9.09%,#174d35_9.09%_18.18%)] sm:aspect-[105/68] sm:bg-[repeating-linear-gradient(90deg,#1b5a3e_0_9.09%,#174d35_9.09%_18.18%)]">
        <svg aria-hidden viewBox="0 0 1050 680" preserveAspectRatio="none" className="absolute inset-0 size-full max-sm:hidden" fill="none" stroke="#F3F5EF" strokeOpacity="0.55" strokeWidth="3">
          <path d="M525 0V680M0 138H165V542H0M1050 138H885V542H1050M0 248H55V432H0M1050 248H995V432H1050" />
          <circle cx="525" cy="340" r="92" />
        </svg>
        {/* Phones get the pitch upright, so eleven shirts fit a narrow screen. */}
        <svg aria-hidden viewBox="0 0 680 1050" preserveAspectRatio="none" className="absolute inset-0 size-full sm:hidden" fill="none" stroke="#F3F5EF" strokeOpacity="0.55" strokeWidth="3">
          <path d="M0 525H680M138 0V165H542V0M138 1050V885H542V1050M248 0V55H432V0M248 1050V995H432V1050" />
          <circle cx="340" cy="525" r="92" />
        </svg>
        <div className="absolute inset-0 grid grid-rows-4 sm:grid-cols-4 sm:grid-rows-1">
          {lines.map((line, i) => (
            <div key={i} className="flex min-w-0 items-center justify-evenly sm:flex-col">
              {line.map((p) => {
                const leaving = picked === p.player_id;
                const name = leaving && incoming ? incoming.name : p.name;
                return (
                  <motion.button
                    key={p.player_id}
                    layout={!reduced}
                    type="button"
                    draggable
                    onDragStart={(e) => (e as unknown as DragEvent).dataTransfer?.setData("text/plain", `out:${p.player_id}`)}
                    whileHover={reduced ? undefined : { y: -4, scale: 1.08 }}
                    aria-label={`${p.name}, pick to swap out`}
                    aria-pressed={leaving}
                    onClick={() => onPick(p)}
                    className="group flex min-h-11 w-14 flex-col items-center sm:w-20"
                  >
                    <span className={`rounded-full ${leaving ? "ring-2 ring-alert" : ""}`}>
                      <ShirtGraphic tla={tla} label={initials(name)} size={38} />
                    </span>
                    <span className="max-w-full truncate rounded-[2px] bg-stadium/70 px-1 text-[11px] leading-4 sm:text-xs">
                      {name.split(" ").at(-1)}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-1 text-sm text-muted">Most-used eleven by minutes. This is not a confirmed team.</figcaption>
    </figure>
  );
}
