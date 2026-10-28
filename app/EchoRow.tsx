import type { ReactNode } from "react";
import { type Echo, type rateEcho, flagSubstat } from "@/lib/rating";

export const formatScore = (score: number | undefined) =>
  score !== undefined && Number.isFinite(score) ? `${score.toFixed(1)}%` : "—";

// Flat HP/ATK/DEF are whole numbers; everything else is a percentage
const FLAT = new Set<string>(["HP", "ATK", "DEF"]);
const formatStat = (name: string, value: number) => (FLAT.has(name) ? `${value}` : `${value}%`);

// One Echo as read from its screenshot, as a table row: Echo/cost, Score, Verdict, Main Stat, Substats, then `actions`.
// A wrong read is fixed by removing the Echo and pasting the screenshot again.
export default function EchoRow({
  echo,
  rating,
  actions,
}: {
  echo: Echo;
  // Its weights also decide which Substats are Dead, so flags and score agree
  rating?: ReturnType<typeof rateEcho>;
  actions: ReactNode;
}) {
  return (
    <tr>
      <td>
        {echo.name ?? "Echo"}
        <br />
        <small>Cost {echo.cost}</small>
      </td>
      <td>{formatScore(rating?.score)}</td>
      <td className={rating?.verdict}>{rating?.verdict ?? "—"}</td>
      <td>
        {echo.mainStat.name} {formatStat(echo.mainStat.name, echo.mainStat.value)}
      </td>
      <td>
        {echo.substats.map((s, k) => (
          <div key={k} className={rating && flagSubstat(s, rating.weights)}>
            {s.name} {formatStat(s.name, s.value)}
          </div>
        ))}
      </td>
      <td>{actions}</td>
    </tr>
  );
}
