"use client";

import { useEffect, useRef, useState } from "react";
import { type StatName, type StatTarget, statVerdict } from "@/lib/rating";

export type CharacterOption = {
  id: string;
  name: string;
  element: string;
  statTargets: Partial<Record<StatName, StatTarget>>;
  nonCritWeaponTargets: Partial<Record<StatName, StatTarget>>;
};

const STATS: StatName[] = ["HP", "ATK", "DEF", "Energy Regen", "Crit. Rate", "Crit. DMG"];
const PERCENT = new Set<StatName>(["Energy Regen", "Crit. Rate", "Crit. DMG"]);

const describe = (t: StatTarget | undefined) =>
  !t || (t.min === undefined && t.max === undefined)
    ? "—"
    : t.max === undefined
      ? `${t.min}+`
      : `${t.min ?? "?"}–${t.max}`;

export default function StatCheck({ characters }: { characters: CharacterOption[] }) {
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [critWeapon, setCritWeapon] = useState(true);
  const [stats, setStats] = useState<Partial<Record<StatName, number>>>({});
  const [status, setStatus] = useState<{ reading?: boolean; error?: string }>({});

  const character = characters.find((c) => c.id === characterId);
  const targets = { ...character?.statTargets, ...(critWeapon ? {} : character?.nonCritWeaponTargets) };

  // Only the latest screenshot's answer counts when several reads overlap
  const latestRead = useRef(0);

  async function read(image: File) {
    const id = ++latestRead.current;
    setStatus({ reading: true });
    const form = new FormData();
    form.append("image", image);
    try {
      const res = await fetch("/api/ocr", { method: "POST", body: form });
      const body = await res.json().catch(() => ({ error: `Server answered ${res.status}` }));
      if (id !== latestRead.current) return;
      if (!res.ok) return setStatus({ error: body.error });
      setStats(body);
      setStatus({});
    } catch (e) {
      if (id === latestRead.current) setStatus({ error: (e as Error).message });
    }
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const image = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (image) read(image);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <>
      <fieldset>
        <legend>Character</legend>
        <select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.element})
            </option>
          ))}
        </select>{" "}
        <label>
          <input type="checkbox" checked={critWeapon} onChange={(e) => setCritWeapon(e.target.checked)} /> Crit Weapon
        </label>
      </fieldset>

      <fieldset>
        <legend>Attributes Screenshot</legend>
        <p className="paste">
          Press <b>Ctrl+V</b> to paste a screenshot, or{" "}
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        </p>
        {status.reading && <p>Reading screenshot… (can take up to 30 seconds)</p>}
        {status.error && <p className="error">Error: {status.error}</p>}
      </fieldset>

      <table>
        <thead>
          <tr>
            <th>Stat</th>
            <th>Value</th>
            <th>Stat Target</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          {STATS.map((name) => {
            const value = stats[name];
            const target = targets[name];
            const verdict = value !== undefined && target ? statVerdict(value, target) : undefined;
            return (
              <tr key={name}>
                <td>{name}</td>
                <td>
                  <input
                    type="number"
                    step="0.1"
                    value={value ?? ""}
                    onChange={(e) =>
                      setStats({ ...stats, [name]: e.target.value === "" ? undefined : Number(e.target.value) })
                    }
                  />
                  {PERCENT.has(name) && "%"}
                </td>
                <td>{describe(target)}</td>
                <td className={verdict}>{verdict ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
