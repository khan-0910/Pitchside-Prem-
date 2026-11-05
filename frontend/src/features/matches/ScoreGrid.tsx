import { percent } from "@/lib/format";

/** Scoreline chances as a heat grid. One hue, and each cell carries its number. */
export function ScoreGrid({ matrix, home, away }: { matrix: number[][]; home: string; away: string }) {
  const size = Math.min(matrix.length, 6);
  const top = Math.max(...matrix.flat());
  return (
    <figure className="m-0">
      <table className="border-separate border-spacing-0.5 text-sm">
        <caption className="mb-2 text-left text-muted">Scoreline chances. {home} goals down, {away} goals across.</caption>
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">Goals</span></th>
            {Array.from({ length: size }, (_, j) => <th key={j} scope="col" className="font-normal text-muted num">{j}</th>)}
          </tr>
        </thead>
        <tbody className="num">
          {matrix.slice(0, size).map((row, i) => (
            <tr key={i}>
              <th scope="row" className="pr-1 font-normal text-muted">{i}</th>
              {row.slice(0, size).map((value, j) => {
                const strength = value / top;
                return (
                  <td
                    key={j}
                    title={`${i}-${j}: ${percent(value, 1)}`}
                    className="h-9 w-11 rounded-[2px] text-center sm:w-12"
                    style={{
                      background: `rgb(11 122 67 / ${(strength * 0.85 + 0.03).toFixed(2)})`,
                      color: strength > 0.55 ? "#FFFFFF" : "#0F1512",
                    }}
                  >
                    {percent(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
