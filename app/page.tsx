import { readdir, readFile } from "node:fs/promises";
import StatCheck, { type CharacterOption, type SonataSet } from "./StatCheck";

async function loadCharacters(): Promise<CharacterOption[]> {
  const dir = "data/characters";
  const files = await Promise.all(
    (await readdir(dir)).map(async (f) => JSON.parse(await readFile(`${dir}/${f}`, "utf8"))),
  );
  return files
    .map(({ id, name, element, build, sources, profile }) => ({
      id,
      name,
      element,
      profile,
      statTargets: build.statTargets,
      nonCritWeaponTargets: build.nonCritWeaponTargets,
      substatWeights: build.substatWeights,
      recommendedMainStats: build.recommendedMainStats,
      // Raw per-source targets so the page can show where Build Guides disagree
      sources: Object.values(sources)
        .filter((s: any) => !s.error)
        .map((s: any) => ({ source: s.source, statTargets: s.statTargets, nonCritWeaponTargets: s.nonCritWeaponTargets ?? {} })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Missing until the first scrape that writes it; the page then just has no weapons or sets to pick
const readJson = (path: string, fallback: unknown) => readFile(path, "utf8").then(JSON.parse, () => fallback);

export default async function Page() {
  const [characters, weapons, sonata] = await Promise.all([
    loadCharacters(),
    readJson("data/weapons.json", []),
    readJson("data/sonata.json", { sets: [] }),
  ]);
  return <StatCheck characters={characters} weapons={weapons} sonataSets={(sonata.sets as SonataSet[]).sort((a, b) => a.name.localeCompare(b.name))} />;
}
