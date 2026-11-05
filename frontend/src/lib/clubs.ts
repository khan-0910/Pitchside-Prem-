/** Shirt colours, used as plain colour fields. No crests or marks. */
const COLOURS: Record<string, [string, string]> = {
  ARS: ["#EF0107", "#FFFFFF"], AVL: ["#670E36", "#95BFE5"], BOU: ["#DA291C", "#111111"], BRE: ["#E30613", "#FFFFFF"],
  BHA: ["#0057B8", "#FFFFFF"], BUR: ["#6C1D45", "#99D6EA"], CHE: ["#034694", "#FFFFFF"], COV: ["#6CBBE6", "#FFFFFF"],
  CRY: ["#1B458F", "#C4122E"], EVE: ["#003399", "#FFFFFF"], FUL: ["#FFFFFF", "#111111"], HUL: ["#F5A12D", "#111111"],
  IPS: ["#3A64A3", "#FFFFFF"], LEE: ["#FFFFFF", "#1D428A"], LEI: ["#003090", "#FDBE11"], LIV: ["#C8102E", "#F6EB61"],
  MCI: ["#6CABDD", "#FFFFFF"], MUN: ["#DA291C", "#FBE122"], NEW: ["#111111", "#FFFFFF"], NFO: ["#DD0000", "#FFFFFF"],
  SOU: ["#D71920", "#FFFFFF"], SUN: ["#EB172B", "#FFFFFF"], TOT: ["#FFFFFF", "#132257"], WHU: ["#7A263A", "#1BB1E7"],
  WOL: ["#FDB913", "#231F20"],
};

export const clubColours = (tla: string): [string, string] => COLOURS[tla] ?? ["#5B655F", "#FFFFFF"];

/** Readable text colour for a shirt, from its luminance. */
export function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#0F1512" : "#FFFFFF";
}
