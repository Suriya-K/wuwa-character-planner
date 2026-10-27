import { readdir, readFile } from "node:fs/promises";
import StatCheck, { type CharacterOption } from "./StatCheck";

async function loadCharacters(): Promise<CharacterOption[]> {
  const dir = "data/characters";
  const files = await Promise.all(
    (await readdir(dir)).map(async (f) => JSON.parse(await readFile(`${dir}/${f}`, "utf8"))),
  );
  return files
    .map(({ id, name, element, build, sources }) => ({
      id,
      name,
      element,
      statTargets: build.statTargets,
      nonCritWeaponTargets: build.nonCritWeaponTargets,
      // Raw per-source targets so the page can show where Build Guides disagree
      sources: Object.values(sources)
        .filter((s: any) => !s.error)
        .map((s: any) => ({ source: s.source, statTargets: s.statTargets, nonCritWeaponTargets: s.nonCritWeaponTargets ?? {} })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default async function Page() {
  return <StatCheck characters={await loadCharacters()} />;
}
