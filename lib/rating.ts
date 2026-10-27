export type StatTarget = { min?: number; max?: number };
export type StatVerdict = "Low" | "OK" | "High";

export function statVerdict(value: number, target: StatTarget): StatVerdict {
  if (target.min !== undefined && value < target.min) return "Low";
  if (target.max !== undefined && value > target.max) return "High";
  return "OK";
}

// Highest single roll per Substat, from the community build sheet's "Echo Substat Ranges" tab (July 2026)
export const MAX_ROLL = {
  "Crit. Rate": 10.5,
  "Crit. DMG": 21,
  "ATK%": 11.6,
  "HP%": 11.6,
  "DEF%": 14.7,
  "Energy Regen": 12.4,
  ATK: 60,
  HP: 580,
  DEF: 70,
  "Basic Attack DMG Bonus": 11.6,
  "Heavy Attack DMG Bonus": 11.6,
  "Resonance Skill DMG Bonus": 11.6,
  "Resonance Liberation DMG Bonus": 11.6,
} as const;

export type SubstatName = keyof typeof MAX_ROLL;
export type EchoCost = 1 | 3 | 4;
export type Echo = {
  cost: EchoCost;
  level: number;
  mainStat: { name: string; value: number };
  substats: { name: SubstatName; value: number }[];
};
export type EchoVerdict = "Replace" | "Usable" | "Keep";
export type CharacterBuild = {
  substatWeights: Partial<Record<SubstatName, number>>;
  recommendedMainStats: Record<EchoCost, string[]>;
  statTargets?: Partial<Record<StatName, StatTarget>>;
};

// How much of one stat an Echo adds to the stat-screen total
const contribution = (echo: Echo, name: StatName) =>
  [echo.mainStat, ...echo.substats].filter((s) => s.name === name).reduce((sum, s) => sum + s.value, 0);

export function rateEcho(
  echo: Echo,
  character: CharacterBuild,
  stats: Partial<Record<StatName, number>> = {},
): { score: number; verdict: EchoVerdict } {
  if (echo.level !== 25) throw new Error(`Only Maxed Echoes (+25) can be rated, got +${echo.level}`);
  const weights = { ...character.substatWeights };
  // Guides value Energy Regen only "until" its target: if the target holds without this Echo, its ER is wasted
  const erTarget = character.statTargets?.["Energy Regen"]?.min;
  const er = stats["Energy Regen"];
  if (erTarget !== undefined && er !== undefined && er - contribution(echo, "Energy Regen") >= erTarget) {
    weights["Energy Regen"] = 0;
  }
  const weight = (name: SubstatName) => weights[name] ?? 0;
  const earned = echo.substats.reduce((sum, s) => sum + (s.value / MAX_ROLL[s.name]) * weight(s.name), 0);
  // Best possible Echo: five max rolls on the five highest-weighted Substats
  const best = Object.values(weights)
    .sort((a, b) => b - a)
    .slice(0, 5)
    .reduce((a, b) => a + b, 0);
  const score = (earned / best) * 100;
  if (!character.recommendedMainStats[echo.cost].includes(echo.mainStat.name)) return { score, verdict: "Replace" };
  return { score, verdict: score < 40 ? "Replace" : score <= 60 ? "Usable" : "Keep" };
}

// Stats shown on the first page of the Attributes Screenshot
export type StatName = "HP" | "ATK" | "DEF" | "Energy Regen" | "Crit. Rate" | "Crit. DMG";

export type GuideSource = {
  source: string;
  statTargets: Partial<Record<StatName, StatTarget>>;
  substatWeights: Partial<Record<SubstatName, number>>;
  mainStats: Record<EchoCost, string[]>;
  // Crit. Rate/Crit. DMG targets when the character holds a non-Crit Weapon; statTargets assume a Crit Weapon
  nonCritWeaponTargets?: Partial<Record<StatName, StatTarget>>;
};
export type FailedSource = { source: string; error: string };

// Guides say "22% ER" meaning 122% on the stat screen; base Energy Regen is 100%
const toScreenTotal = (name: StatName, v: number) => (name === "Energy Regen" && v < 100 ? v + 100 : v);

const median = (xs: number[]) => {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

function mergeTargets(perSource: Partial<Record<StatName, StatTarget>>[]) {
  const merged: Partial<Record<StatName, StatTarget>> = {};
  for (const name of new Set(perSource.flatMap((t) => Object.keys(t) as StatName[]))) {
    const targets = perSource.map((t) => t[name]).filter((t) => t !== undefined);
    const pick = (key: keyof StatTarget) =>
      median(targets.flatMap((t) => (t[key] === undefined ? [] : [toScreenTotal(name, t[key])])));
    merged[name] = { min: pick("min"), max: pick("max") };
  }
  return merged;
}

// Hand-written corrections; each named stat, substat or cost replaces the scraped one whole
export type BuildOverride = {
  statTargets?: Partial<Record<StatName, StatTarget>>;
  substatWeights?: Partial<Record<SubstatName, number>>;
  recommendedMainStats?: Partial<Record<EchoCost, string[]>>;
};

export function mergeGuides(
  all: (GuideSource | FailedSource)[],
  override: BuildOverride = {},
): CharacterBuild & {
  statTargets: Partial<Record<StatName, StatTarget>>;
  nonCritWeaponTargets: Partial<Record<StatName, StatTarget>>;
} {
  const sources = all.filter((s): s is GuideSource => !("error" in s));
  const statTargets = mergeTargets(sources.map((s) => s.statTargets));
  const nonCritWeaponTargets = mergeTargets(sources.map((s) => s.nonCritWeaponTargets ?? {}));
  const substatWeights: Partial<Record<SubstatName, number>> = {};
  for (const name of new Set(sources.flatMap((s) => Object.keys(s.substatWeights) as SubstatName[]))) {
    substatWeights[name] = sources.reduce((sum, s) => sum + (s.substatWeights[name] ?? 0), 0) / sources.length;
  }
  return {
    statTargets: { ...statTargets, ...override.statTargets },
    nonCritWeaponTargets,
    substatWeights: { ...substatWeights, ...override.substatWeights },
    recommendedMainStats: {
      1: [...new Set(sources.flatMap((s) => s.mainStats[1]))],
      3: [...new Set(sources.flatMap((s) => s.mainStats[3]))],
      4: [...new Set(sources.flatMap((s) => s.mainStats[4]))],
      ...override.recommendedMainStats,
    },
  };
}

export function compareEchoes(
  candidate: Echo,
  equipped: Echo,
  stats: Partial<Record<StatName, number>>,
  character: CharacterBuild & { statTargets: Partial<Record<StatName, StatTarget>> },
) {
  // ponytail: only stats that add straight onto the screen total; ATK%/HP%/DEF% need base stats
  const additive = ["Energy Regen", "Crit. Rate", "Crit. DMG"] as const;
  const whatIf: Partial<Record<StatName, { before: number; after: number; verdict: StatVerdict }>> = {};
  const swapped: Partial<Record<StatName, number>> = {};
  for (const name of additive) {
    const before = stats[name];
    if (before === undefined) continue;
    const after = before - contribution(equipped, name) + contribution(candidate, name);
    swapped[name] = after;
    whatIf[name] = { before, after, verdict: statVerdict(after, character.statTargets[name] ?? {}) };
  }
  const scoreDelta = rateEcho(candidate, character, swapped).score - rateEcho(equipped, character, stats).score;
  return { scoreDelta, whatIf };
}
