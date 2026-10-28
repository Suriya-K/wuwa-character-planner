export type StatTarget = { min?: number; max?: number };
export type StatVerdict = "Low" | "OK" | "High";

export function statVerdict(value: number, target: StatTarget): StatVerdict {
  if (target.min !== undefined && value < target.min) return "Low";
  if (target.max !== undefined && value > target.max) return "High";
  return "OK";
}

// Every value a Substat can roll, lowest first, from the community build sheet's "Echo Substat Ranges" tab (July 2026)
const DMG_ROLLS = [6.4, 7.1, 7.9, 8.6, 9.4, 10.1, 10.9, 11.6];
export const ROLLS = {
  "Crit. Rate": [6.3, 6.9, 7.5, 8.1, 8.7, 9.3, 9.9, 10.5],
  "Crit. DMG": [12.6, 13.8, 15.0, 16.2, 17.4, 18.6, 19.8, 21.0],
  "ATK%": DMG_ROLLS,
  "HP%": DMG_ROLLS,
  "DEF%": [8.1, 9.0, 10.0, 10.9, 11.8, 12.8, 13.8, 14.7],
  "Energy Regen": [6.8, 7.6, 8.4, 9.2, 10.0, 10.8, 11.6, 12.4],
  ATK: [30, 40, 50, 60],
  HP: [320, 360, 390, 430, 470, 510, 540, 580],
  DEF: [40, 50, 60, 70],
  "Basic Attack DMG Bonus": DMG_ROLLS,
  "Heavy Attack DMG Bonus": DMG_ROLLS,
  "Resonance Skill DMG Bonus": DMG_ROLLS,
  "Resonance Liberation DMG Bonus": DMG_ROLLS,
} as const;

// Highest single roll per Substat
export const MAX_ROLL = Object.fromEntries(Object.entries(ROLLS).map(([name, rolls]) => [name, rolls.at(-1)!])) as {
  [K in keyof typeof ROLLS]: number;
};

export type SubstatName = keyof typeof ROLLS;
export const SUBSTAT_NAMES = Object.keys(MAX_ROLL) as SubstatName[];
export const ECHO_COSTS = [4, 3, 1] as const;
export type EchoCost = (typeof ECHO_COSTS)[number];
export const ELEMENTS = ["Aero", "Electro", "Fusion", "Glacio", "Havoc", "Spectro"] as const;
export const MAIN_STAT_NAMES = [
  "Crit. Rate", "Crit. DMG", "ATK%", "HP%", "DEF%", "Energy Regen", "Healing Bonus",
  ...ELEMENTS.map((e) => `${e} DMG Bonus`),
];
export type Echo = {
  name?: string;
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
const contribution = (echo: Echo, name: string) =>
  [echo.mainStat, ...echo.substats].filter((s) => s.name === name).reduce((sum, s) => sum + s.value, 0);

export function rateEcho(
  echo: Echo,
  character: CharacterBuild,
  stats: Partial<Record<StatName, number>> = {},
): { score: number; verdict: EchoVerdict; weights: Partial<Record<SubstatName, number>> } {
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
  // `weights` as scored, Energy Regen zeroed or not, so Dead Substat flags agree with the score
  if (!character.recommendedMainStats[echo.cost].includes(echo.mainStat.name)) return { score, verdict: "Replace", weights };
  return { score, verdict: score < 40 ? "Replace" : score <= 60 ? "Usable" : "Keep", weights };
}

// Stats shown on the first page of the Attributes Screenshot
export const STAT_NAMES = ["HP", "ATK", "DEF", "Energy Regen", "Crit. Rate", "Crit. DMG"] as const;
export type StatName = (typeof STAT_NAMES)[number];

export type GuideSource = {
  source: string;
  statTargets: Partial<Record<StatName, StatTarget>>;
  substatWeights: Partial<Record<SubstatName, number>>;
  mainStats: Record<EchoCost, string[]>;
  // Crit. Rate/Crit. DMG targets when the character holds a non-Crit Weapon; statTargets assume a Crit Weapon
  nonCritWeaponTargets?: Partial<Record<StatName, StatTarget>>;
  // The source text the numbers came from, kept so disagreements can be checked by hand
  quotes?: string[];
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

// Gemini reads "2000-2400+" as a 2000..2400 range though the "+" means no ceiling; the source's own quotes settle it
function dropOpenCeilings(targets: Partial<Record<StatName, StatTarget>> = {}, quotes: string[] = []) {
  const num = (v: number) => String(v).replace(".", "\\.");
  return Object.fromEntries(
    Object.entries(targets).map(([name, t]) => {
      const open = t.min !== undefined && t.max !== undefined &&
        quotes.some((q) => new RegExp(`\\b${num(t.min!)}%?\\s*[-–]\\s*${num(t.max!)}%?\\s*\\+`).test(q));
      return [name, open ? { min: t.min } : t];
    }),
  ) as Partial<Record<StatName, StatTarget>>;
}

function mergeTargets(perSource: Partial<Record<StatName, StatTarget>>[]) {
  const merged: Partial<Record<StatName, StatTarget>> = {};
  for (const name of new Set(perSource.flatMap((t) => Object.keys(t) as StatName[]))) {
    const targets = perSource.map((t) => t[name]).filter((t) => t !== undefined);
    const min = median(targets.flatMap((t) => (t.min === undefined ? [] : [toScreenTotal(name, t.min)])));
    // A source that names this stat but gives no ceiling votes "no ceiling" (Infinity), so one guide's cap can't win alone
    const max = median(targets.map((t) => (t.max === undefined ? Infinity : toScreenTotal(name, t.max))));
    merged[name] = { min, max: max === Infinity ? undefined : max };
  }
  return merged;
}

// Main Stats at least half the sources recommend for a cost, so one misread source can't add one alone
function endorsedByHalf(sources: GuideSource[], cost: EchoCost) {
  // Only sources that say something about this cost get a vote
  const voters = sources.filter((s) => s.mainStats[cost].length > 0);
  const votes = new Map<string, number>();
  for (const s of voters) for (const name of new Set(s.mainStats[cost])) votes.set(name, (votes.get(name) ?? 0) + 1);
  return [...votes].filter(([, n]) => n * 2 >= voters.length).map(([name]) => name);
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
  const statTargets = mergeTargets(sources.map((s) => dropOpenCeilings(s.statTargets, s.quotes)));
  const nonCritWeaponTargets = mergeTargets(sources.map((s) => dropOpenCeilings(s.nonCritWeaponTargets, s.quotes)));
  const substatWeights: Partial<Record<SubstatName, number>> = {};
  for (const name of new Set(sources.flatMap((s) => Object.keys(s.substatWeights) as SubstatName[]))) {
    substatWeights[name] = sources.reduce((sum, s) => sum + (s.substatWeights[name] ?? 0), 0) / sources.length;
  }
  return {
    statTargets: { ...statTargets, ...override.statTargets },
    nonCritWeaponTargets,
    substatWeights: { ...substatWeights, ...override.substatWeights },
    recommendedMainStats: {
      1: endorsedByHalf(sources, 1),
      3: endorsedByHalf(sources, 3),
      4: endorsedByHalf(sources, 4),
      ...override.recommendedMainStats,
    },
  };
}

export function compareEchoes(
  candidate: Echo,
  equipped: Echo,
  stats: Partial<Record<StatName, number>>,
  character: CharacterBuild & { statTargets: Partial<Record<StatName, StatTarget>> },
  // Character + Equipped Weapon base; without it only the stats that add straight on can be worked out
  base?: BaseStats,
) {
  const names = base ? STAT_NAMES : (["Energy Regen", "Crit. Rate", "Crit. DMG"] as const);
  const PERCENT_OF = { HP: "HP%", ATK: "ATK%", DEF: "DEF%" } as const;
  // What an Echo adds to one screen total; flat HP/ATK/DEF substats add on, their % versions scale the base
  const amount = (echo: Echo, name: StatName) =>
    contribution(echo, name) +
    (base && name in PERCENT_OF ? (base[name as keyof BaseStats] * contribution(echo, PERCENT_OF[name as keyof BaseStats])) / 100 : 0);
  const whatIf: Partial<Record<StatName, { before: number; after: number; verdict: StatVerdict }>> = {};
  const swapped: Partial<Record<StatName, number>> = {};
  for (const name of names) {
    const before = stats[name];
    if (before === undefined) continue;
    const after = before - amount(equipped, name) + amount(candidate, name);
    swapped[name] = after;
    whatIf[name] = { before, after, verdict: statVerdict(after, character.statTargets[name] ?? {}) };
  }
  const scoreDelta = rateEcho(candidate, character, swapped).score - rateEcho(equipped, character, stats).score;
  return { scoreDelta, whatIf };
}

// Stats a Weapon or Sonata Set can add; ATK%/HP%/DEF% scale base stats, the rest add straight onto the screen total
export const BONUS_STATS = ["ATK%", "HP%", "DEF%", "Crit. Rate", "Crit. DMG", "Energy Regen"] as const;
export type BonusStat = (typeof BONUS_STATS)[number];
export type Bonus = Partial<Record<BonusStat, number>>;
// Level 90 base stats, before any % bonus
export type BaseStats = { HP: number; ATK: number; DEF: number };
export type Weapon = {
  name: string;
  type: string;
  rarity: number;
  // Level 90
  baseAtk: number;
  secondary: Bonus;
  // Always-on passive stats, one value per rank R1..R5
  passive: Partial<Record<BonusStat, number[]>>;
};

const SCALES = { "ATK%": "ATK", "HP%": "HP", "DEF%": "DEF" } as const;

export function weaponBonus(weapon: Weapon, rank: number): Bonus {
  const bonus: Bonus = { ...weapon.secondary };
  for (const [name, values] of Object.entries(weapon.passive) as [BonusStat, number[]][]) {
    bonus[name] = (bonus[name] ?? 0) + values[rank - 1];
  }
  return bonus;
}

// Stat-screen totals after adding `bonus` (negative values take one away). `base` is character + weapon base.
// Moving the weapon's base ATK by `baseAtkChange` carries the ATK% already on screen; flat ATK (`flat`) doesn't scale.
// Without Base Stats, HP/ATK/DEF can't be worked out and are left out.
export function shiftStats(
  stats: Partial<Record<StatName, number>>,
  base: BaseStats | undefined,
  bonus: Bonus,
  baseAtkChange = 0,
  flat = 0,
): Partial<Record<StatName, number>> {
  const out = { ...stats };
  if (!base) {
    delete out.HP;
    delete out.ATK;
    delete out.DEF;
  } else if (out.ATK !== undefined) {
    out.ATK += (baseAtkChange * (out.ATK - flat)) / base.ATK;
  }
  const newBase = base && { ...base, ATK: base.ATK + baseAtkChange };
  for (const [name, v] of Object.entries(bonus) as [BonusStat, number][]) {
    const stat: StatName = name in SCALES ? SCALES[name as keyof typeof SCALES] : (name as StatName);
    // HP/ATK/DEF were dropped above when there is no base, so `newBase` exists for every scaled stat reaching here
    if (out[stat] === undefined) continue;
    out[stat] += name in SCALES ? (newBase![stat as keyof BaseStats] * v) / 100 : v;
  }
  return out;
}

type Wielded = { weapon: Weapon; rank: number };

// What the stat screen would show with `to` instead of `from`
export function swapWeapon(
  stats: Partial<Record<StatName, number>>,
  character: BaseStats | undefined,
  flat: number,
  from: Wielded,
  to: Wielded,
) {
  const change: Bonus = weaponBonus(to.weapon, to.rank);
  for (const [name, v] of Object.entries(weaponBonus(from.weapon, from.rank)) as [BonusStat, number][]) {
    change[name] = (change[name] ?? 0) - v;
  }
  const base = character && { ...character, ATK: character.ATK + from.weapon.baseAtk };
  return shiftStats(stats, base, change, to.weapon.baseAtk - from.weapon.baseAtk, flat);
}

// Flat ATK the Loadout adds: ATK substats plus the Secondary Main Stat of 4-cost (150) and 3-cost (100) Echoes
export const flatAtk = (loadout: Echo[]) =>
  loadout.reduce(
    (sum, e) =>
      sum + (e.cost === 4 ? 150 : e.cost === 3 ? 100 : 0) +
      e.substats.filter((s) => s.name === "ATK").reduce((n, s) => n + s.value, 0),
    0,
  );

export type SubstatFlag = "Dead" | "Low";

// Dead Substat or Low Roll, judged one Substat at a time; nothing for a good one
export function flagSubstat(
  substat: { name: SubstatName; value: number },
  weights: Partial<Record<SubstatName, number>>,
): SubstatFlag | undefined {
  // No weights at all means no guide data, not that every Substat is useless
  if (Object.keys(weights).length === 0) return;
  if ((weights[substat.name] ?? 0) < 0.25) return "Dead";
  // Below the third-lowest roll rather than equal to one of two values, so a slightly misread number still counts
  if (substat.value < ROLLS[substat.name][2]) return "Low";
}
