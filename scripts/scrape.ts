// Scrape Build Guides into data/characters/<id>.json (ADR 0002).
// Usage: bun run scrape [--force <character-id>]
import { mkdir, readdir } from "node:fs/promises";
import { generateFromUrl, generateJson } from "../lib/gemini";
import {
  type BuildOverride,
  type FailedSource,
  type GuideSource,
  ELEMENTS,
  MAIN_STAT_NAMES,
  MAX_ROLL,
  STAT_NAMES,
  type StatName,
  type StatTarget,
  type SubstatName,
  mergeGuides,
} from "../lib/rating";

const SHEET =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2iscTAIfIzg6JHhakvlrY_E3au2pFk0HDajhxSnkFZcosauLIvYCaSVP9_iN_hG11lJCVeI9u1DUZ";
// Every Character block in the sheet starts with this heading
const BLOCK_MARKER = "Ascension / Forte Material Breakdown";
const DIR = "data/characters";
const PARALLEL = 4;

const STATS = [...STAT_NAMES];
const SUBSTATS = Object.keys(MAX_ROLL) as SubstatName[];
const MAIN_STATS = MAIN_STAT_NAMES;

type CharacterFile = {
  id: string;
  name: string;
  element: string;
  sources: Record<string, GuideSource | FailedSource>;
  sourceHashes: Record<string, string>;
  override: BuildOverride;
  // Hand-set when Prydwen's slug differs from our id (e.g. "the-shorekeeper")
  prydwenSlug?: string;
  build: ReturnType<typeof mergeGuides>;
};

type Extracted = {
  name: string;
  statTargets: { stat: StatName; min: number | null; max: number | null }[];
  nonCritWeaponTargets: { stat: StatName; min: number | null; max: number | null }[];
  substatTiers: SubstatName[][];
  mainStats: { cost4: string[]; cost3: string[]; cost1: string[] };
  quotes: string[];
};

const target = {
  type: "object",
  properties: {
    stat: { type: "string", enum: STATS },
    min: { type: "number", nullable: true },
    max: { type: "number", nullable: true },
  },
  required: ["stat", "min", "max"],
};
const mainList = { type: "array", items: { type: "string", enum: MAIN_STATS } };
const SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    statTargets: { type: "array", items: target },
    nonCritWeaponTargets: { type: "array", items: target },
    substatTiers: { type: "array", items: { type: "array", items: { type: "string", enum: SUBSTATS } } },
    mainStats: {
      type: "object",
      properties: { cost4: mainList, cost3: mainList, cost1: mainList },
      required: ["cost4", "cost3", "cost1"],
    },
    quotes: { type: "array", items: { type: "string" } },
  },
  required: ["name", "statTargets", "nonCritWeaponTargets", "substatTiers", "mainStats", "quotes"],
};

const PROMPT = `Below is one Wuthering Waves character's block from a community build spreadsheet, as CSV with empty cells collapsed to " | ".
Extract:
- name: the character's name exactly as written (e.g. "Yangyang: Xuanling", "Rover: Havoc"). Empty string if this block is not a single character's build.
- statTargets: from "RECOMMENDED STATS @ LV.90". Use the "Crit. Ratio (Crit. Weapon)" row for Crit. Rate and Crit. DMG ("70% : 265%" means Crit. Rate 70, Crit. DMG 265).
- nonCritWeaponTargets: only Crit. Rate and Crit. DMG, from the "Crit. Ratio (Non-Crit.)" row.
  A single number or "X+" is a minimum only (max null). Set max only when a closed range like "110-120%" is given; a range ending in "+" like "1900-2100+" has no max (min 1900). "N/A" or "0%" means omit the stat.
  Energy Regen is the stat-screen total as written (e.g. 120). Numbers without % signs.
- substatTiers: from "Substat Priority", best first. Each ">" starts a new tier; "/" puts substats in the same tier.
  Basic% = Basic Attack DMG Bonus, Heavy% = Heavy Attack DMG Bonus, Skill% = Resonance Skill DMG Bonus, Liberation% = Resonance Liberation DMG Bonus,
  Flat ATK = ATK, Flat HP = HP, Flat DEF = DEF, "Energy Regen (until 120%)" = Energy Regen.
- mainStats: from "Echo Mainstats (43311)". cost4 is the first row's options, cost3 the next two rows (e.g. "Havoc DMG Bonus / ATK" means Havoc DMG Bonus and ATK%), cost1 the last row.
- quotes: the exact text of the rows you took numbers and priorities from.`;

// Step 1 for Prydwen: url_context fetches the page but can't return schema JSON, so copy the text out first
const prydwenCopyPrompt = (id: string) => `Open https://www.prydwen.gg/wuthering-waves/characters/${id}
If it is a Wuthering Waves character build page, copy out verbatim: the character's name, the recommended or endgame stats,
the substat priority, and the recommended echo main stats for each echo cost. Copy text only, do not summarize.
If the page could not be opened or is not a single character's build page, answer exactly NOT_FOUND.`;

// Step 2 for Prydwen: the same schema as the sheet, so names are forced onto the fixed English lists
const GUIDE_PROMPT = `Below is text copied from a Wuthering Waves character build guide. Extract:
- name: the character's name. Empty string if the text is not a single character's build.
- statTargets: recommended stats at level 90 for HP, ATK, DEF, Energy Regen, Crit. Rate, Crit. DMG.
  A single number or "X+" is a minimum only (max null). Set max only for a closed range like "60-70%"; "1900-2100+" has no max.
  Energy Regen is the stat-screen total (e.g. 120). Numbers without % signs.
- nonCritWeaponTargets: only if the guide gives separate Crit targets for non-Crit weapons; otherwise empty.
- substatTiers: substat priority best first; each ">" starts a new tier, "=" or "/" keeps substats in one tier.
  Map damage-type bonuses to Basic/Heavy Attack, Resonance Skill or Resonance Liberation DMG Bonus; flat ATK/HP/DEF to ATK/HP/DEF.
- mainStats: recommended echo main stats for cost 4, cost 3 and cost 1. "ATK" on a 3- or 1-cost means ATK%.
- quotes: the exact sentences you took numbers and priorities from.`;

async function inBatches<T>(items: T[], run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += PARALLEL) await Promise.all(items.slice(i, i + PARALLEL).map(run));
}

// "Yangyang: Xuanling" -> "yangyang-xuanling", matching Prydwen's slug style (verified in ticket 07)
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function toGuideSource(x: Extracted): GuideSource {
  const targets = (list: Extracted["statTargets"]) =>
    Object.fromEntries(
      list.map((t) => [t.stat, { ...(t.min !== null && { min: t.min }), ...(t.max !== null && { max: t.max }) } satisfies StatTarget]),
    );
  const substatWeights: GuideSource["substatWeights"] = {};
  // ponytail: tiers spread evenly from 1 down to 1/n; refine if Echo Scores feel off
  x.substatTiers.forEach((tier, i) => {
    for (const name of tier) substatWeights[name] = Math.max(substatWeights[name] ?? 0, (x.substatTiers.length - i) / x.substatTiers.length);
  });
  return {
    source: "sheet",
    statTargets: targets(x.statTargets),
    nonCritWeaponTargets: targets(x.nonCritWeaponTargets),
    substatWeights,
    mainStats: { 4: x.mainStats.cost4, 3: x.mainStats.cost3, 1: x.mainStats.cost1 },
    quotes: x.quotes,
  };
}

async function fetchText(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.text();
}

async function sheetTabs() {
  const html = await fetchText(`${SHEET}/pubhtml`);
  return [...html.matchAll(/name: "([^"]*)", pageUrl: "[^"]*gid=(\d+)/g)]
    .map(([, name, gid]) => ({ name, gid }))
    .filter((t) => (ELEMENTS as readonly string[]).includes(t.name));
}

async function main() {
  const force = process.argv.includes("--force") ? process.argv[process.argv.indexOf("--force") + 1] : undefined;
  await mkdir(DIR, { recursive: true });

  const files = new Map<string, CharacterFile>();
  for (const f of await readdir(DIR)) files.set(f.replace(/\.json$/, ""), await Bun.file(`${DIR}/${f}`).json());
  if (force && !files.has(force)) throw new Error(`--force ${force}: no such character in ${DIR}`);
  const scrapedHashes = new Set([...files.values()].filter((f) => f.id !== force).map((f) => f.sourceHashes.sheet));

  const jobs: { element: string; index: number; text: string; hash: string }[] = [];
  for (const tab of await sheetTabs()) {
    const csv = await fetchText(`${SHEET}/pub?gid=${tab.gid}&single=true&output=csv`);
    csv.split(BLOCK_MARKER).slice(1).forEach((block, index) => {
      const text = BLOCK_MARKER + block.replace(/,{2,}/g, " | ");
      jobs.push({ element: tab.name, index, text, hash: Bun.hash(text).toString(36) });
    });
  }
  if (jobs.length === 0) throw new Error("No character blocks found; has the sheet layout changed?");
  const todo = jobs.filter((j) => !scrapedHashes.has(j.hash));
  console.log(`${jobs.length} blocks in sheet, ${jobs.length - todo.length} unchanged, scraping ${todo.length}`);

  const failed: { element: string; block: number; error: string }[] = [];
  await inBatches(todo, async (job) => {
    try {
      const x = await generateJson<Extracted>([{ text: `${PROMPT}\n\n${job.text}` }], SCHEMA);
      if (!x.name) return console.log(`  skip ${job.element} #${job.index}: not a character block`);
      const id = slug(x.name);
      const prev = files.get(id);
      files.set(id, {
        id,
        name: x.name,
        element: job.element,
        sources: { ...prev?.sources, sheet: toGuideSource(x) },
        sourceHashes: { ...prev?.sourceHashes, sheet: job.hash },
        override: prev?.override ?? {},
      prydwenSlug: prev?.prydwenSlug,
        build: prev?.build as CharacterFile["build"],
      });
      console.log(`  ok   ${id}`);
    } catch (e) {
      failed.push({ element: job.element, block: job.index, error: (e as Error).message.slice(0, 300) });
      console.log(`  FAIL ${job.element} #${job.index}: ${(e as Error).message.slice(0, 120)}`);
    }
  });

  // Prydwen: retried every run until it succeeds; --force refreshes one character
  const prydwenTodo = [...files.values()].filter((f) => f.id === force || !f.sources.prydwen || "error" in f.sources.prydwen);
  console.log(`Prydwen: scraping ${prydwenTodo.length}`);
  await inBatches(prydwenTodo, async (f) => {
    let error: string;
    try {
      const page = await generateFromUrl(prydwenCopyPrompt(f.prydwenSlug ?? f.id));
      if (!page.retrieved || page.text.trim() === "NOT_FOUND") {
        error = "NOT_FOUND";
      } else {
        const x = await generateJson<Extracted>([{ text: `${GUIDE_PROMPT}\n\n${page.text}` }], SCHEMA);
        if (x.name) {
          f.sources.prydwen = { ...toGuideSource(x), source: "prydwen" };
          return console.log(`  ok   ${f.id}`);
        }
        error = "NOT_FOUND";
      }
    } catch (e) {
      error = (e as Error).message.slice(0, 300);
    }
    f.sources.prydwen = { source: "prydwen", error };
    console.log(`  FAIL ${f.id}: ${error.slice(0, 120)}`);
  });

  // Re-merge every file so hand edits to `override` apply on each run
  for (const f of files.values()) {
    f.build = mergeGuides(Object.values(f.sources), f.override);
    await Bun.write(`${DIR}/${f.id}.json`, JSON.stringify(f, null, 2) + "\n");
  }
  const characters = [...files.values()].map(({ id, name, element }) => ({ id, name, element }));
  characters.sort((a, b) => a.name.localeCompare(b.name));
  // Characters whose id isn't a Prydwen slug (or Prydwen has no page for yet): fix by hand in ticket 07's follow-up
  const prydwenMissing = [...files.values()]
    .filter((f) => "error" in f.sources.prydwen && (f.sources.prydwen as FailedSource).error === "NOT_FOUND")
    .map((f) => f.id);
  await Bun.write("data/roster.json", JSON.stringify({ characters, failed, prydwenMissing }, null, 2) + "\n");
  console.log(`${characters.length} characters, ${failed.length} failed sheet blocks, no Prydwen page: ${prydwenMissing.join(", ") || "none"}`);
}

await main();
