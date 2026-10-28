import { describe, expect, test } from "bun:test";
import { type Echo, type GuideSource, type Weapon, compareEchoes, flatAtk, mergeGuides, rateEcho, shiftStats, statVerdict, swapWeapon, weaponBonus } from "./rating";

// Real Echoes from prototype/shots on the prototype/spikes branch
const thousandPuppetPavilion: Echo = {
  cost: 4,
  level: 25,
  mainStat: { name: "Crit. DMG", value: 44 },
  substats: [
    { name: "Heavy Attack DMG Bonus", value: 10.1 },
    { name: "HP", value: 470 },
    { name: "ATK%", value: 11.6 },
    { name: "Crit. Rate", value: 10.5 },
    { name: "DEF%", value: 8.1 },
  ],
};

const fogLionarch: Echo = {
  cost: 3,
  level: 25,
  mainStat: { name: "Havoc DMG Bonus", value: 30 },
  substats: [
    { name: "Crit. Rate", value: 8.1 },
    { name: "Crit. DMG", value: 17.4 },
    { name: "ATK%", value: 10.9 },
    { name: "Resonance Liberation DMG Bonus", value: 8.6 },
    { name: "Basic Attack DMG Bonus", value: 10.1 },
  ],
};

const critMains = { 1: ["ATK%"], 3: ["Havoc DMG Bonus"], 4: ["Crit. DMG", "Crit. Rate"] };

describe("statVerdict", () => {
  test("below the Stat Target min is Low", () => {
    expect(statVerdict(115, { min: 122, max: 130 })).toBe("Low");
  });

  test("above the Stat Target max is High", () => {
    expect(statVerdict(164, { min: 122, max: 130 })).toBe("High");
  });

  test("exactly on either edge is OK", () => {
    expect(statVerdict(122, { min: 122, max: 130 })).toBe("OK");
    expect(statVerdict(130, { min: 122, max: 130 })).toBe("OK");
  });

  test("a stat with no ceiling is never High", () => {
    expect(statVerdict(300, { min: 210 })).toBe("OK");
  });
});

describe("rateEcho", () => {
  test("max rolls on the only weighted substats score 100% and Keep", () => {
    const character = { substatWeights: { "Crit. Rate": 1, "ATK%": 0.5 }, recommendedMainStats: critMains };
    expect(rateEcho(thousandPuppetPavilion, character)).toEqual({ score: 100, verdict: "Keep" });
  });

  test("a Main Stat outside Recommended Main Stats is Replace even with perfect substats", () => {
    const character = {
      substatWeights: { "Crit. Rate": 1, "ATK%": 0.5 },
      recommendedMainStats: { ...critMains, 4: ["Crit. Rate"] },
    };
    expect(rateEcho(thousandPuppetPavilion, character)).toEqual({ score: 100, verdict: "Replace" });
  });

  test("an Echo below +25 is rejected", () => {
    const character = { substatWeights: { "Crit. Rate": 1 }, recommendedMainStats: critMains };
    expect(() => rateEcho({ ...thousandPuppetPavilion, level: 20 }, character)).toThrow("+25");
  });

  test("no weighted substats scores 0% and Replace", () => {
    const character = { substatWeights: { "Energy Regen": 1 }, recommendedMainStats: critMains };
    expect(rateEcho(thousandPuppetPavilion, character)).toEqual({ score: 0, verdict: "Replace" });
  });

  test("a score between 40% and 60% is Usable", () => {
    const character = {
      substatWeights: { "Crit. Rate": 1, "Crit. DMG": 1, "Energy Regen": 1 },
      recommendedMainStats: critMains,
    };
    const { score, verdict } = rateEcho(fogLionarch, character);
    expect(score).toBeCloseTo(53.33, 1);
    expect(verdict).toBe("Usable");
  });
});

const guide = (statTargets: GuideSource["statTargets"], substatWeights: GuideSource["substatWeights"] = {}): GuideSource => ({
  source: "test",
  statTargets,
  substatWeights,
  mainStats: critMains,
});

describe("mergeGuides", () => {
  test("Stat Target is the median of source mins to the median of source maxes, no max counting as no ceiling", () => {
    const merged = mergeGuides([
      guide({ "Crit. Rate": { min: 60, max: 70 } }),
      guide({ "Crit. Rate": { min: 65 } }),
      guide({ "Crit. Rate": { min: 70, max: 80 } }),
    ]);
    expect(merged.statTargets["Crit. Rate"]).toEqual({ min: 65, max: 80 });
  });

  test("one source's ceiling is outvoted by one source with none", () => {
    const merged = mergeGuides([guide({ "Energy Regen": { min: 120 } }), guide({ "Energy Regen": { min: 107, max: 119 } })]);
    expect(merged.statTargets["Energy Regen"]).toEqual({ min: 113.5 });
  });

  test("non-Crit weapon Crit targets merge separately from the Crit weapon ones", () => {
    const merged = mergeGuides([
      { ...guide({ "Crit. Rate": { min: 70 } }), nonCritWeaponTargets: { "Crit. Rate": { min: 65 } } },
      { ...guide({ "Crit. Rate": { min: 60 } }), nonCritWeaponTargets: { "Crit. Rate": { min: 60 } } },
    ]);
    expect(merged.statTargets["Crit. Rate"]).toEqual({ min: 65 });
    expect(merged.nonCritWeaponTargets["Crit. Rate"]).toEqual({ min: 62.5 });
  });

  test("Energy Regen stated as bonus-only is read as the stat-screen total", () => {
    const merged = mergeGuides([guide({ "Energy Regen": { min: 22 } }), guide({ "Energy Regen": { min: 130 } })]);
    expect(merged.statTargets["Energy Regen"]).toEqual({ min: 126 });
  });

  test("Substat Weight is the mean across sources, unmentioned counting as 0", () => {
    const merged = mergeGuides([guide({}, { "Crit. Rate": 1, "ATK%": 0.5 }), guide({}, { "Crit. Rate": 0.5 })]);
    expect(merged.substatWeights).toEqual({ "Crit. Rate": 0.75, "ATK%": 0.25 });
  });

  test("a Main Stat endorsed by fewer than half the sources is dropped", () => {
    const mains = (cost3: string[]) => ({ ...guide({}), mainStats: { 1: ["ATK%"], 3: cost3, 4: ["Crit. Rate"] } });
    const merged = mergeGuides([
      mains(["Havoc DMG Bonus", "Havoc DMG Bonus", "ATK%"]),
      mains(["Havoc DMG Bonus", "ATK%"]),
      mains(["Havoc DMG Bonus"]),
      mains(["Aero DMG Bonus"]),
    ]);
    expect(merged.recommendedMainStats[3]).toEqual(["Havoc DMG Bonus", "ATK%"]);
  });

  test("a source silent about a cost doesn't vote on that cost", () => {
    const merged = mergeGuides([
      { ...guide({}), mainStats: { 1: ["ATK%"], 3: ["Havoc DMG Bonus"], 4: ["Crit. Rate"] } },
      { ...guide({}), mainStats: { 1: [], 3: [], 4: [] } },
      { ...guide({}), mainStats: { 1: [], 3: [], 4: [] } },
    ]);
    expect(merged.recommendedMainStats).toEqual({ 1: ["ATK%"], 3: ["Havoc DMG Bonus"], 4: ["Crit. Rate"] });
  });

  test("a hand-written override replaces that stat's scraped target and leaves the rest", () => {
    const merged = mergeGuides(
      [guide({ "Crit. Rate": { min: 60, max: 70 }, "Energy Regen": { min: 120 } }, { "Crit. Rate": 1 })],
      { statTargets: { "Crit. Rate": { min: 55 } }, substatWeights: { "Energy Regen": 0.2 } },
    );
    expect(merged.statTargets).toEqual({ "Crit. Rate": { min: 55 }, "Energy Regen": { min: 120 } });
    expect(merged.substatWeights).toEqual({ "Crit. Rate": 1, "Energy Regen": 0.2 });
  });

  test("a failed source is skipped, not counted as zero", () => {
    const merged = mergeGuides([{ source: "mobalytics", error: "URL_RETRIEVAL_STATUS_ERROR" }, guide({}, { "Crit. Rate": 1 })]);
    expect(merged.substatWeights).toEqual({ "Crit. Rate": 1 });
  });

  test("with two sources, a Main Stat either one endorses counts, once each", () => {
    const merged = mergeGuides([
      { ...guide({}), mainStats: { 1: ["ATK%"], 3: ["Havoc DMG Bonus", "Havoc DMG Bonus"], 4: ["Crit. DMG"] } },
      { ...guide({}), mainStats: { 1: ["ATK%"], 3: ["ATK%"], 4: ["Crit. Rate"] } },
    ]);
    expect(merged.recommendedMainStats).toEqual({
      1: ["ATK%"],
      3: ["Havoc DMG Bonus", "ATK%"],
      4: ["Crit. DMG", "Crit. Rate"],
    });
  });
});

describe("compareEchoes", () => {
  const equipped: Echo = {
    ...thousandPuppetPavilion,
    substats: [
      { name: "Energy Regen", value: 12.4 },
      { name: "HP", value: 470 },
      { name: "ATK%", value: 11.6 },
      { name: "Crit. DMG", value: 10.5 },
      { name: "DEF%", value: 8.1 },
    ],
  };
  const yangyang = {
    substatWeights: { "Crit. Rate": 1, "Crit. DMG": 1, "ATK%": 0.5 },
    recommendedMainStats: critMains,
    statTargets: { "Energy Regen": { min: 122, max: 130 }, "Crit. Rate": { min: 60, max: 80 }, "Crit. DMG": { min: 210 } },
  };
  // Real Attributes Screenshot values
  const stats = { "Energy Regen": 164, "Crit. Rate": 80.8, "Crit. DMG": 255.2 };

  test("score delta is the Candidate Echo's score minus the Equipped Echo's", () => {
    expect(compareEchoes(thousandPuppetPavilion, equipped, stats, yangyang).scoreDelta).toBeCloseTo(20, 5);
  });

  test("what-if swaps both Echoes' Main Stat and Substats out of the stat totals and re-judges them", () => {
    const { whatIf } = compareEchoes(thousandPuppetPavilion, equipped, stats, yangyang);
    expect(whatIf["Energy Regen"]?.after).toBeCloseTo(151.6, 5);
    expect(whatIf["Energy Regen"]?.verdict).toBe("High");
    expect(whatIf["Crit. Rate"]?.after).toBeCloseTo(91.3, 5);
    expect(whatIf["Crit. Rate"]?.verdict).toBe("High");
    expect(whatIf["Crit. DMG"]?.after).toBeCloseTo(244.7, 5);
    expect(whatIf["Crit. DMG"]?.verdict).toBe("OK");
  });

  test("with Base Stats, ATK%/HP%/DEF% scale the base and flat substats add straight on", () => {
    const flatEquipped: Echo = {
      ...thousandPuppetPavilion,
      substats: [
        { name: "Crit. Rate", value: 10.5 },
        { name: "ATK", value: 50 },
        { name: "HP%", value: 10 },
        { name: "DEF", value: 60 },
        { name: "Heavy Attack DMG Bonus", value: 10.1 },
      ],
    };
    const screen = { ...stats, ATK: 2000, HP: 15000, DEF: 1100 };
    const base = { HP: 10000, ATK: 1000, DEF: 1000 };
    const { whatIf } = compareEchoes(thousandPuppetPavilion, flatEquipped, screen, yangyang, base);
    expect(whatIf.ATK?.after).toBeCloseTo(2000 - 50 + 116, 5);
    expect(whatIf.HP?.after).toBeCloseTo(15000 - 1000 + 470, 5);
    expect(whatIf.DEF?.after).toBeCloseTo(1100 - 60 + 81, 5);
    expect(compareEchoes(thousandPuppetPavilion, flatEquipped, screen, yangyang).whatIf.ATK).toBeUndefined();
  });
});

describe("rateEcho Energy Regen", () => {
  const erEcho: Echo = {
    ...thousandPuppetPavilion,
    substats: [
      { name: "Energy Regen", value: 12.4 },
      { name: "HP", value: 470 },
      { name: "ATK%", value: 11.6 },
      { name: "Crit. DMG", value: 10.5 },
      { name: "DEF%", value: 8.1 },
    ],
  };
  const character = {
    substatWeights: { "Crit. Rate": 1, "Crit. DMG": 1, "Energy Regen": 1, "ATK%": 0.5 },
    recommendedMainStats: critMains,
    statTargets: { "Energy Regen": { min: 122 } },
  };

  test("Energy Regen is worth nothing when the target is met even without this Echo", () => {
    expect(rateEcho(erEcho, character, { "Energy Regen": 164 }).score).toBeCloseTo(40, 5);
  });

  test("Energy Regen keeps its weight when this Echo is needed to reach the target", () => {
    expect(rateEcho(erEcho, character, { "Energy Regen": 130 }).score).toBeCloseTo(57.14, 1);
  });

  test("compareEchoes judges each Echo's Energy Regen against the stats it would actually sit in", () => {
    expect(compareEchoes(thousandPuppetPavilion, erEcho, { "Energy Regen": 164 }, character).scoreDelta).toBeCloseTo(20, 5);
  });
});

describe("open-ended ranges", () => {
  const prydwen = (quotes: string[]): GuideSource => ({
    source: "prydwen",
    statTargets: { ATK: { min: 2000, max: 2400 }, "Energy Regen": { min: 115, max: 125 }, "Crit. Rate": { min: 60, max: 70 } },
    substatWeights: {},
    mainStats: { 4: [], 3: [], 1: [] },
    quotes,
  });

  test("a range ending in + quoted by the source has no ceiling", () => {
    const { statTargets } = mergeGuides([prydwen(["ATK: 2000-2400+", "Energy Regen: 115%-125%+", "CRIT Rate: 60-70%"])]);
    expect(statTargets.ATK).toEqual({ min: 2000, max: undefined });
    expect(statTargets["Energy Regen"]).toEqual({ min: 115, max: undefined });
    expect(statTargets["Crit. Rate"]).toEqual({ min: 60, max: 70 });
  });

  test("without a quote the ceiling stays", () => {
    expect(mergeGuides([prydwen([])]).statTargets.ATK).toEqual({ min: 2000, max: 2400 });
  });
});

describe("weapons and Sonata Set buffs", () => {
  const aemeath = { HP: 11025, ATK: 425, DEF: 1149 };
  const atkSword: Weapon = { name: "ATK Sword", type: "Sword", rarity: 5, baseAtk: 500, secondary: { "ATK%": 30 }, passive: {} };
  const critSword: Weapon = {
    name: "Crit Sword", type: "Sword", rarity: 5, baseAtk: 587, secondary: { "Crit. Rate": 24.3 },
    passive: { "ATK%": [12, 15, 18, 21, 24] },
  };
  const stats = { HP: 15000, ATK: 2000, "Crit. Rate": 60, "Energy Regen": 120 };

  test("weaponBonus adds the passive at the chosen rank to the secondary stat", () => {
    expect(weaponBonus(critSword, 3)).toEqual({ "Crit. Rate": 24.3, "ATK%": 18 });
  });

  test("a set buff adds Crit and Energy Regen straight on and scales ATK%/HP% from base stats", () => {
    const after = shiftStats(stats, { ...aemeath, ATK: 925 }, { "Crit. Rate": 20, "ATK%": 10, "HP%": 10 });
    expect(after["Crit. Rate"]).toBe(80);
    expect(after.ATK).toBeCloseTo(2092.5, 5);
    expect(after.HP).toBeCloseTo(16102.5, 5);
    expect(after["Energy Regen"]).toBe(120);
  });

  test("without Base Stats only the stats that add straight on are shifted", () => {
    const after = shiftStats(stats, undefined, { "Crit. Rate": 20, "ATK%": 10 });
    expect(after["Crit. Rate"]).toBe(80);
    expect(after.ATK).toBeUndefined();
    expect(after.HP).toBeUndefined();
  });

  test("swapping weapons moves base ATK under the ATK% already on screen, flat ATK excluded", () => {
    const after = swapWeapon(stats, aemeath, 300, { weapon: atkSword, rank: 1 }, { weapon: critSword, rank: 1 });
    // (425+587) * (1 + 0.8378 - 0.30 + 0.12) + 300, where 1.8378 = (2000-300)/(425+500)
    expect(after.ATK).toBeCloseTo(1012 * ((2000 - 300) / 925 - 0.3 + 0.12) + 300, 5);
    expect(after["Crit. Rate"]).toBeCloseTo(84.3, 5);
  });

  test("flatAtk counts ATK substats and the Secondary Main Stat of 4- and 3-cost Echoes", () => {
    const threeCost: Echo = { cost: 3, level: 25, mainStat: { name: "ATK%", value: 30 }, substats: [{ name: "ATK", value: 50 }] };
    const oneCost: Echo = { cost: 1, level: 25, mainStat: { name: "ATK%", value: 18 }, substats: [{ name: "ATK", value: 40 }] };
    expect(flatAtk([thousandPuppetPavilion, threeCost, oneCost])).toBe(150 + 100 + 50 + 40);
  });
});
