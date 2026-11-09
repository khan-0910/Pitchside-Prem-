import { useReducedMotion } from "@/animations/useReducedMotion";
import HoloCard from "@/components/reactbits/HoloCard";
import { ShirtGraphic } from "@/components/football/ShirtCard";
import { clubColours, inkOn } from "@/lib/clubs";
import { euros, initials } from "@/lib/format";
import type { PlayerDetail } from "@/types/api";

const W = 320;
const H = 448;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const svg = (body: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Archivo, Arial, sans-serif">${body}</svg>`)}`;
const stat = (n: number | null | undefined, d = 0) => (n == null ? "–" : n.toFixed(d));

/** Front: the club's shirt colours, the player, and this season's observed numbers. */
function front(p: PlayerDetail): string {
  const [main, trim] = clubColours(p.tla);
  const ink = inkOn(main);
  const rows: [string, string][] = [
    ["MIN", stat(p.minutes)], ["G", stat(p.goals)], ["A", stat(p.assists)],
    ["xG", stat(p.xg, 1)], ["xA", stat(p.xa, 1)], ["VALUE", p.market_value_eur ? euros(p.market_value_eur) : "–"],
  ];
  return svg(`
    <rect width="${W}" height="${H}" fill="#0f1512"/>
    <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="10" fill="${main}"/>
    <path d="M10 250 L${W - 10} 200 V${H - 20} a10 10 0 0 1 -10 10 H20 a10 10 0 0 1 -10 -10Z" fill="#0f1512" opacity=".88"/>
    <text x="26" y="52" fill="${ink}" font-size="34" font-weight="900" font-style="italic">${esc(p.tla)}</text>
    <text x="26" y="76" fill="${ink}" font-size="15" font-weight="700" opacity=".85">${esc((p.profile?.position_name ?? p.position ?? "").toUpperCase())}</text>
    <circle cx="${W - 70}" cy="115" r="62" fill="${trim}" opacity=".9"/>
    <text x="${W - 70}" y="133" text-anchor="middle" fill="${inkOn(trim)}" font-size="50" font-weight="900" font-style="italic">${esc(initials(p.name))}</text>
    <text x="26" y="${p.name.length > 18 ? 268 : 272}" fill="#fff" font-size="${p.name.length > 18 ? 21 : 26}" font-weight="900">${esc(p.name)}</text>
    <text x="26" y="296" fill="#ffd400" font-size="14" font-weight="700">${esc(p.profile?.role ?? p.team)}</text>
    ${rows.map(([k, v], i) => {
      const x = 26 + (i % 3) * 96, y = 340 + Math.floor(i / 3) * 56;
      return `<text x="${x}" y="${y}" fill="#fff" font-size="${k === "VALUE" ? 19 : 24}" font-weight="900">${esc(v)}</text><text x="${x}" y="${y + 18}" fill="#9fb3a6" font-size="11" font-weight="700" letter-spacing="1.5">${k}</text>`;
    }).join("")}
  `);
}

/** Back: where the player ranks in their position, per 90 minutes. */
function back(p: PlayerDetail): string {
  const radar = (p.profile?.radar ?? []).slice(0, 7);
  return svg(`
    <rect width="${W}" height="${H}" rx="14" fill="#0f1512"/>
    <text x="24" y="44" fill="#ffd400" font-size="15" font-weight="800" letter-spacing="1">PER 90, PERCENTILE</text>
    <text x="24" y="66" fill="#9fb3a6" font-size="12">Against ${esc(p.profile?.position_name?.toLowerCase() ?? "their position")}s this season</text>
    ${radar.length === 0 ? `<text x="24" y="120" fill="#fff" font-size="15">Not enough minutes for a profile.</text>` : radar.map((a, i) => {
      const y = 104 + i * 46, w = Math.max(4, (a.percentile / 100) * 200);
      return `<text x="24" y="${y}" fill="#fff" font-size="14" font-weight="700">${esc(a.label)}</text>
        <rect x="24" y="${y + 8}" width="200" height="10" rx="5" fill="#26302b"/>
        <rect x="24" y="${y + 8}" width="${w}" height="10" rx="5" fill="${a.percentile >= 70 ? "#38c172" : "#b9c1bb"}"/>
        <text x="${W - 24}" y="${y + 18}" text-anchor="end" fill="#fff" font-size="16" font-weight="900">${a.percentile.toFixed(0)}</text>`;
    }).join("")}
    <text x="24" y="${H - 22}" fill="#9fb3a6" font-size="11">Tap to flip back</text>
  `);
}

/** A collectible card for the player. It tilts and catches the light; a tap flips it. */
export function PlayerCard({ player }: { player: PlayerDetail }) {
  const reduced = useReducedMotion();
  if (reduced) return <ShirtGraphic tla={player.tla} label={initials(player.name)} size={84} />;
  return (
    <HoloCard
      image={front(player)}
      backImage={back(player)}
      alt={`${player.name} card. Press to flip to per 90 rankings.`}
      preset="shards"
      intensity={0.3}
      width={220}
      tiltMax={12}
    />
  );
}
