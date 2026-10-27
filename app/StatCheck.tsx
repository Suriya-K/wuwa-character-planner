"use client";

import { useEffect, useRef, useState } from "react";
import { STAT_NAMES, type StatName, type StatTarget, statVerdict } from "@/lib/rating";

type Targets = Partial<Record<StatName, StatTarget>>;

export type CharacterOption = {
  id: string;
  name: string;
  element: string;
  statTargets: Targets;
  nonCritWeaponTargets: Targets;
  sources: { source: string; statTargets: Targets; nonCritWeaponTargets: Targets }[];
};

const PERCENT = new Set<StatName>(["Energy Regen", "Crit. Rate", "Crit. DMG"]);
const CRIT = new Set<StatName>(["Crit. Rate", "Crit. DMG"]);

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
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Save stays off until the stored snapshot has loaded, so an early click can't overwrite it with blanks
  const [loaded, setLoaded] = useState(false);
  // Values typed or read before the snapshot arrives win over the stored ones
  const edited = useRef(false);
  const shownId = useRef(characterId);

  // Load the character's Build Snapshot so any device picks up where the last one left off
  useEffect(() => {
    let current = true;
    shownId.current = characterId;
    setStats({});
    setCritWeapon(true);
    setSavedAt(null);
    setLoaded(false);
    edited.current = false;
    fetch(`/api/snapshot/${characterId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Loading snapshot: ${res.status}`))))
      .then((snapshot) => {
        if (!current) return;
        setLoaded(true);
        if (!snapshot || edited.current) return;
        setStats(snapshot.stats);
        setCritWeapon(snapshot.critWeapon);
        setSavedAt(snapshot.savedAt);
      })
      .catch((e: Error) => current && setStatus({ error: e.message }));
    return () => {
      current = false;
    };
  }, [characterId]);

  async function save() {
    const id = characterId;
    const res = await fetch(`/api/snapshot/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stats, critWeapon }),
    }).catch((e: Error) => e);
    if (shownId.current !== id) return; // user switched character mid-save
    if (res instanceof Error) return setStatus({ error: res.message });
    const body = await res.json().catch(() => ({ error: `Server answered ${res.status}` }));
    if (!res.ok) return setStatus({ error: body.error });
    setSavedAt(body.savedAt);
    setStatus({});
  }

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
      edited.current = true;
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
          {STAT_NAMES.map((name) => {
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
                    onChange={(e) => {
                      edited.current = true;
                      setStats({ ...stats, [name]: e.target.value === "" ? undefined : Number(e.target.value) });
                    }}
                  />
                  {PERCENT.has(name) && "%"}
                </td>
                <td>
                  {describe(target)}
                  <br />
                  <small>
                    {character?.sources
                      .map((src) => {
                        // A source with no non-Crit targets has nothing to say about Crit stats then
                        const t =
                          !critWeapon && CRIT.has(name) ? src.nonCritWeaponTargets[name] : src.statTargets[name];
                        return t && `${src.source}: ${describe(t)}`;
                      })
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </td>
                <td className={verdict}>{verdict ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        <button type="button" onClick={save} disabled={!loaded}>
          Save Build Snapshot
        </button>{" "}
        {savedAt ? `Last saved ${new Date(savedAt).toLocaleString()}` : "Not saved yet"}
      </p>
    </>
  );
}
