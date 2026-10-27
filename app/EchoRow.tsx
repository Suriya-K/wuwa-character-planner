import type { ReactNode } from "react";
import {
  ECHO_COSTS,
  type Echo,
  type EchoCost,
  type EchoVerdict,
  MAIN_STAT_NAMES,
  SUBSTAT_NAMES,
  type SubstatName,
} from "@/lib/rating";

// Empty while retyping; the score shows "—" and Save is refused until it's a number again
const toNumber = (v: string) => (v === "" ? Number.NaN : Number(v));
const shown = (v: number) => (Number.isNaN(v) ? "" : v);

export const formatScore = (score: number | undefined) =>
  score !== undefined && Number.isFinite(score) ? `${score.toFixed(1)}%` : "—";

// One editable Echo as a table row: Echo/cost, Score, Verdict, Main Stat, Substats, then `actions`
export default function EchoRow({
  echo,
  rating,
  onChange,
  actions,
}: {
  echo: Echo;
  rating?: { score: number; verdict: EchoVerdict };
  onChange: (echo: Echo) => void;
  actions: ReactNode;
}) {
  const setSubstat = (k: number, change: Partial<{ name: SubstatName; value: number }>) =>
    onChange({ ...echo, substats: echo.substats.map((s, m) => (m === k ? { ...s, ...change } : s)) });
  return (
    <tr>
      <td>
        {echo.name ?? "Echo"}
        <br />
        Cost{" "}
        <select value={echo.cost} onChange={(e) => onChange({ ...echo, cost: Number(e.target.value) as EchoCost })}>
          {ECHO_COSTS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </td>
      <td>{formatScore(rating?.score)}</td>
      <td className={rating?.verdict}>{rating?.verdict ?? "—"}</td>
      <td>
        <select
          value={echo.mainStat.name}
          onChange={(e) => onChange({ ...echo, mainStat: { ...echo.mainStat, name: e.target.value } })}
        >
          {MAIN_STAT_NAMES.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <br />
        <input
          type="number"
          step="0.1"
          value={shown(echo.mainStat.value)}
          onChange={(e) => onChange({ ...echo, mainStat: { ...echo.mainStat, value: toNumber(e.target.value) } })}
        />
      </td>
      <td>
        {echo.substats.map((s, k) => (
          <div key={k}>
            <select value={s.name} onChange={(e) => setSubstat(k, { name: e.target.value as SubstatName })}>
              {SUBSTAT_NAMES.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>{" "}
            <input
              type="number"
              step="0.1"
              value={shown(s.value)}
              onChange={(e) => setSubstat(k, { value: toNumber(e.target.value) })}
            />
          </div>
        ))}
      </td>
      <td>{actions}</td>
    </tr>
  );
}
