import { readdir, readFile } from "node:fs/promises";
import StatCheck, { type CharacterOption } from "./StatCheck";

async function loadCharacters(): Promise<CharacterOption[]> {
  const dir = "data/characters";
  const files = await Promise.all(
    (await readdir(dir)).map(async (f) => JSON.parse(await readFile(`${dir}/${f}`, "utf8"))),
  );
  return files
    .map(({ id, name, element, build }) => ({
      id,
      name,
      element,
      statTargets: build.statTargets,
      nonCritWeaponTargets: build.nonCritWeaponTargets,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default async function Page() {
  return <StatCheck characters={await loadCharacters()} />;
}
