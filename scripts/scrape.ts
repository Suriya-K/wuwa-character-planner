// Scrape Build Guides into data/characters/<id>.json (ADR 0002).
// Usage: bun run scrape [--force <character-id> | sonata]
import { mkdir, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { generateFromUrl, generateJson } from "../lib/gemini";
import {
  type BaseStats,
  BONUS_STATS,
  type Bonus,
  type BonusStat,
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
  type Weapon,
  mergeGuides,
} from "../lib/rating";

const SHEET =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR2iscTAIfIzg6JHhakvlrY_E3au2pFk0HDajhxSnkFZcosauLIvYCaSVP9_iN_hG11lJCVeI9u1DUZ";
// Every Character block in the sheet starts with this heading
const BLOCK_MARKER = "Ascension / Forte Material Breakdown";
const DIR = "data/characters";
const YOUTUBE = "data/youtube.json";
const WEAPONS = "data/weapons.json";
const SONATA = "data/sonata.json";
const ICONS = "public/icons";
const SONATA_TAB = "Substat Ranges + Sonata Sets";
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
  // From the Prydwen character page; retried until it has Base Stats (Prydwen lacks them for some new characters)
  profile?: { weaponType: string; base?: BaseStats };
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

const VIDEO_PROMPT = `${GUIDE_PROMPT}
This is a video guide, possibly in Thai. Only use numbers the creator recommends as targets (said aloud or shown as a recommendation card).
Never use the creator's own character stat screen or showcase numbers as targets. Always answer with the English names above.
Energy Regen said as a bonus (e.g. "22% ER") is fine as is; it is converted to the stat-screen total later.`;

// watch?v=ID or youtu.be/ID; undefined for anything that isn't a URL
const videoId = (url: string) => {
  try {
    const u = new URL(url);
    return u.searchParams.get("v") ?? (u.pathname.split("/").pop() || undefined);
  } catch {
    return undefined;
  }
};

async function inBatches<T>(items: T[], run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += PARALLEL) await Promise.all(items.slice(i, i + PARALLEL).map(run));
}

// Prydwen blocks plain fetches (Cloudflare 403) and url_context truncates long pages, so render with local Chrome
async function renderPrydwen(path: string) {
  const chrome = Bun.spawn(
    ["google-chrome-stable", "--headless=new", "--disable-gpu", "--virtual-time-budget=15000",
      "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
      // Own profile per run: parallel Chromes sharing the default one hang
      `--user-data-dir=${tmpdir()}/scrape-chrome-${crypto.randomUUID()}`,
      "--dump-dom", `https://www.prydwen.gg/wuthering-waves/${path}`],
    { stderr: "ignore", timeout: 90_000 },
  );
  return new Response(chrome.stdout).text();
}

const textOf = (html: string) =>
  html.replace(/<[^>]*>/g, "\n").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\n\s*\n+/g, "\n");

// Echo main stats, substats and endgame stats all sit between these two headings
async function renderedPrydwenBuild(slug: string) {
  const text = textOf(await renderPrydwen(`characters/${slug}`));
  const start = text.indexOf("Best Echo Stats");
  const end = text.indexOf("Skill Priority", start);
  return start < 0 || end < 0 ? undefined : text.slice(start, end);
}

// The data a Next.js page streams in self.__next_f.push calls, one JSON row per line
const nextRows = (html: string) =>
  [...html.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs)].map(([, c]) => JSON.parse(`"${c}"`)).join("").split("\n");

const findKey = (node: unknown, key: string): unknown => {
  if (typeof node !== "object" || node === null) return undefined;
  if (key in node) return (node as Record<string, unknown>)[key];
  for (const child of Object.values(node)) {
    const found = findKey(child, key);
    if (found !== undefined) return found;
  }
};

const WEAPON_STAT: Record<string, BonusStat> = {
  ATK: "ATK%", HP: "HP%", "Max HP": "HP%", "HP%": "HP%", DEF: "DEF%", "CRIT Rate": "Crit. Rate", "Crit. Rate": "Crit. Rate",
  "CRIT DMG": "Crit. DMG", "CRIT DMG%": "Crit. DMG", "Energy Reg.": "Energy Regen", "Energy Regen": "Energy Regen",
};

type PrydwenWeapon = {
  Name: string; Weapon_Type: string; Rarity: number; Effect: string; Array_0: (string | number)[];
  Stat_primary: number; Stat_secondary: string; Stat_secondary_value: number;
};

function toWeapon(w: PrydwenWeapon): Weapon | undefined {
  const secondary = WEAPON_STAT[w.Stat_secondary];
  if (!secondary) return;
  // Only an unconditional first sentence ("Increases ATK by {0}." / "ATK is increased by {0}.") shows on the stat screen
  const m = w.Effect.match(/^(?:Increases? (.+?) by \{0\}|(.+?) (?:is )?increased by \{0\})\./);
  const passiveStat = m && WEAPON_STAT[m[1] ?? m[2]];
  return {
    name: w.Name,
    type: w.Weapon_Type,
    rarity: w.Rarity,
    baseAtk: w.Stat_primary,
    secondary: { [secondary]: w.Stat_secondary_value },
    passive: passiveStat ? { [passiveStat]: w.Array_0.map((v) => parseFloat(String(v))) } : {},
  };
}

// Minimal RFC 4180 reader: Sonata effect cells hold quoted commas and newlines
function parseCsv(text: string) {
  const rows: string[][] = [[]];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') cell += '"', i++;
      else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") rows.at(-1)!.push(cell), (cell = "");
    else if (ch === "\n") rows.at(-1)!.push(cell), (cell = ""), rows.push([]);
    else if (ch !== "\r") cell += ch;
  }
  rows.at(-1)!.push(cell);
  return rows;
}

type SonataSet = { name: string; pieces: { count: number; text: string; bonus: Bonus }[] };

// Sets sit side by side: a row of names, then rows with "[2PC]" two columns left of each effect's text
function sonataGrid(csv: string): SonataSet[] {
  const rows = parseCsv(csv);
  const start = rows.findIndex((r) => r.some((c) => c.includes("SONATA SETS")));
  const sets: SonataSet[] = [];
  const byColumn = new Map<number, SonataSet>();
  for (const row of rows.slice(start + 1)) {
    const markers = row.flatMap((c, i) => (/^\[\d+PC\]$/.test(c.trim()) ? [i] : []));
    if (markers.length === 0) {
      row.forEach((c, i) => {
        if (!c.trim()) return;
        // "Havoc Eclipse (Havoc, HE, SSE)\npreviously ..." -> "Havoc Eclipse"
        const set = { name: c.split("\n")[0].split("(")[0].trim(), pieces: [] };
        byColumn.set(i, set);
        sets.push(set);
      });
    }
    for (const i of markers) {
      byColumn.get(i + 2)?.pieces.push({ count: Number(row[i].match(/\d+/)![0]), text: row[i + 2].trim(), bonus: {} });
    }
  }
  return sets.filter((set) => set.pieces.length > 0);
}

const SONATA_PROMPT = `Below are Wuthering Waves Sonata Set effects as JSON [{id, text}]. For each, list the stats it gives the wearer, at full stacks:
only ATK%, HP%, DEF%, Crit. Rate, Crit. DMG or Energy Regen that apply to all of the wearer's damage. "ATK + 10%" means ATK%.
Leave out: DMG Bonuses, healing, Crit. Rate limited to one attack type (e.g. "Heavy Attack Crit. Rate"),
and buffs given to the incoming Resonator or other team members. Empty bonus if none.`;

const SONATA_SCHEMA = {
  type: "object",
  properties: {
    effects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          bonus: {
            type: "array",
            items: {
              type: "object",
              properties: { stat: { type: "string", enum: [...BONUS_STATS] }, value: { type: "number" } },
              required: ["stat", "value"],
            },
          },
        },
        required: ["id", "bonus"],
      },
    },
  },
  required: ["effects"],
};

// "Yangyang: Xuanling" -> "yangyang-xuanling", matching Prydwen's slug style (verified in ticket 07)
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function toGuideSource(x: Extracted): GuideSource {
  const targets = (list: Extracted["statTargets"]) =>
    Object.fromEntries(
      // A stat with neither bound says nothing; keeping it would vote "no ceiling" for no reason
      list.filter((t) => t.min !== null || t.max !== null).map((t) => [t.stat, { ...(t.min !== null && { min: t.min }), ...(t.max !== null && { max: t.max }) } satisfies StatTarget]),
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
  return [...html.matchAll(/name: "([^"]*)", pageUrl: "[^"]*gid=(\d+)/g)].map(([, name, gid]) => ({ name, gid }));
}

async function main() {
  const force = process.argv.includes("--force") ? process.argv[process.argv.indexOf("--force") + 1] : undefined;
  await mkdir(DIR, { recursive: true });

  const files = new Map<string, CharacterFile>();
  for (const f of await readdir(DIR)) files.set(f.replace(/\.json$/, ""), await Bun.file(`${DIR}/${f}`).json());
  if (force && force !== "sonata" && !files.has(force)) throw new Error(`--force ${force}: no such character in ${DIR}`);
  const scrapedHashes = new Set([...files.values()].filter((f) => f.id !== force).map((f) => f.sourceHashes.sheet));

  const jobs: { element: string; index: number; text: string; hash: string }[] = [];
  const tabs = await sheetTabs();
  for (const tab of tabs.filter((t) => (ELEMENTS as readonly string[]).includes(t.name))) {
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
        profile: prev?.profile,
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
      let text = page.retrieved && page.text.trim() !== "NOT_FOUND" ? page.text : undefined;
      if (!text) {
        const rendered = await renderedPrydwenBuild(f.prydwenSlug ?? f.id);
        if (rendered) text = `Character: ${f.name}\n${rendered}`;
      }
      if (!text) {
        error = "NOT_FOUND";
      } else {
        const x = await generateJson<Extracted>([{ text: `${GUIDE_PROMPT}\n\n${text}` }], SCHEMA);
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

  // Character profiles (weapon type, level 90 base stats) and icons, once per character
  const profileTodo = [...files.values()].filter((f) => f.id === force || !f.profile?.base);
  console.log(`Profiles: scraping ${profileTodo.length}`);
  await inBatches(profileTodo, async (f) => {
    const text = textOf(await renderPrydwen(`characters/${f.prydwenSlug ?? f.id}`));
    const type = text.match(/uses the\s+(\w+)\s+type weapon/)?.[1];
    const base = text.match(/Lv\.\s+90\s+HP\s+(\d+)\s+ATK\s+(\d+)\s+DEF\s+(\d+)/);
    if (!type) return console.log(`  FAIL ${f.id}: no weapon type on the Prydwen page`);
    f.profile = { weaponType: type, ...(base && { base: { HP: +base[1], ATK: +base[2], DEF: +base[3] } }) };
    console.log(base ? `  ok   ${f.id}` : `  part ${f.id}: ${type}, no level 90 stats yet`);
  });
  await mkdir(ICONS, { recursive: true });
  await inBatches([...files.values()], async (f) => {
    const path = `${ICONS}/${f.id}.webp`;
    if (f.id !== force && (await Bun.file(path).exists())) return;
    const res = await fetch(`https://cdn.prydwen.gg/images/wuthering-waves/characters/${f.prydwenSlug ?? f.id}_icon.webp`);
    if (res.ok) await Bun.write(path, res);
    else console.log(`  no icon for ${f.id}: ${res.status}`);
  });

  // Weapons: all of them, from the JSON Prydwen's weapons page embeds; one render, so refreshed every run
  const weaponRows = nextRows(await renderPrydwen("weapons")).filter((row) => row.includes('"weapons":['));
  const raw = weaponRows.flatMap((row) => (findKey(JSON.parse(row.slice(row.indexOf(":") + 1)), "weapons") as PrydwenWeapon[]) ?? []);
  if (raw.length === 0) throw new Error("No weapons found on Prydwen; has the page changed?");
  const weapons = raw.flatMap((w) => toWeapon(w) ?? (console.log(`  skip weapon ${w.Name}: secondary ${w.Stat_secondary}`), []));
  weapons.sort((a, b) => a.type.localeCompare(b.type) || b.rarity - a.rarity || a.name.localeCompare(b.name));
  await Bun.write(WEAPONS, JSON.stringify(weapons, null, 2) + "\n");
  console.log(`Weapons: ${weapons.length}`);

  // Sonata Sets from the sheet's own tab, re-read only when that tab changes
  const sonataTab = tabs.find((t) => t.name === SONATA_TAB);
  if (!sonataTab) throw new Error(`No "${SONATA_TAB}" tab in the sheet`);
  const sonataCsv = await fetchText(`${SHEET}/pub?gid=${sonataTab.gid}&single=true&output=csv`);
  const sonataHash = Bun.hash(sonataCsv).toString(36);
  const prevSonata = (await Bun.file(SONATA).exists()) ? await Bun.file(SONATA).json() : undefined;
  if (prevSonata?.hash === sonataHash && force !== "sonata") {
    console.log("Sonata Sets: unchanged");
  } else {
    const sets = sonataGrid(sonataCsv);
    if (sets.length === 0) throw new Error("No Sonata Sets found; has the sheet layout changed?");
    const pieces = sets.flatMap((set) => set.pieces);
    const effects = pieces.map((p, id) => ({ id, text: p.text }));
    const x = await generateJson<{ effects: { id: number; bonus: { stat: BonusStat; value: number }[] }[] }>(
      [{ text: `${SONATA_PROMPT}\n\n${JSON.stringify(effects)}` }],
      SONATA_SCHEMA,
    );
    for (const e of x.effects) if (pieces[e.id]) pieces[e.id].bonus = Object.fromEntries(e.bonus.map((b) => [b.stat, b.value]));
    await Bun.write(SONATA, JSON.stringify({ hash: sonataHash, sets }, null, 2) + "\n");
    console.log(`Sonata Sets: ${sets.length}`);
  }

  // YouTube: hand-picked guide videos per character in data/youtube.json (guides only, not showcases)
  // Missing file means no videos; a malformed one should stop the run, not silently drop every video
  const youtube: Record<string, string[]> = (await Bun.file(YOUTUBE).exists()) ? await Bun.file(YOUTUBE).json() : {};
  const videoJobs: { f: CharacterFile; url: string; key: string }[] = [];
  for (const [id, urls] of Object.entries(youtube)) {
    const f = files.get(id);
    if (!f) {
      console.log(`  youtube.json: no character "${id}"`);
      continue;
    }
    const valid = urls.filter((url) => {
      if (videoId(url)) return true;
      console.log(`  youtube.json: skipping bad URL "${url}" for ${id}`);
      return false;
    });
    const keys = new Set(valid.map((url) => `youtube:${videoId(url)}`));
    // A video removed from the list stops counting
    for (const key of Object.keys(f.sources)) if (key.startsWith("youtube:") && !keys.has(key)) delete f.sources[key];
    for (const url of valid) {
      const key = `youtube:${videoId(url)}`;
      const prev = f.sources[key];
      if (f.id === force || !prev || "error" in prev) videoJobs.push({ f, url, key });
    }
  }
  console.log(`YouTube: scraping ${videoJobs.length} videos`);
  await inBatches(videoJobs, async ({ f, url, key }) => {
    try {
      const x = await generateJson<Extracted>([{ file_data: { file_uri: url } }, { text: VIDEO_PROMPT }], SCHEMA);
      if (!x.name) throw new Error("not a character build guide");
      f.sources[key] = { ...toGuideSource(x), source: key };
      console.log(`  ok   ${f.id} ${key}`);
    } catch (e) {
      f.sources[key] = { source: key, error: (e as Error).message.slice(0, 300) };
      console.log(`  FAIL ${f.id} ${key}: ${(e as Error).message.slice(0, 120)}`);
    }
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
