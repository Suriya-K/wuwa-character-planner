"use client";

import { useEffect, useRef, useState } from "react";
import {
  type CharacterBuild,
  type Echo,
  type EchoCost,
  ECHO_COSTS,
  MAIN_STAT_NAMES,
  STAT_NAMES,
  SUBSTAT_NAMES as SUBSTATS,
  type StatName,
  type StatTarget,
  type SubstatName,
  rateEcho,
  statVerdict,
} from "@/lib/rating";

type Targets = Partial<Record<StatName, StatTarget>>;

export type CharacterOption = CharacterBuild & {
  id: string;
  name: string;
  element: string;
  statTargets: Targets;
  nonCritWeaponTargets: Targets;
  sources: { source: string; statTargets: Targets; nonCritWeaponTargets: Targets }[];
};

const PERCENT = new Set<StatName>(["Energy Regen", "Crit. Rate", "Crit. DMG"]);
const CRIT = new Set<StatName>(["Crit. Rate", "Crit. DMG"]);
const LOADOUT_SIZE = 5;

const describe = (t: StatTarget | undefined) =>
  !t || (t.min === undefined && t.max === undefined)
    ? "—"
    : t.max === undefined
      ? `${t.min}+`
      : `${t.min ?? "?"}–${t.max}`;

// Empty while retyping; the score shows "—" and Save is refused until it's a number again
const toNumber = (v: string) => (v === "" ? Number.NaN : Number(v));
const shown = (v: number) => (Number.isNaN(v) ? "" : v);

export default function StatCheck({ characters }: { characters: CharacterOption[] }) {
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [critWeapon, setCritWeapon] = useState(true);
  const [stats, setStats] = useState<Partial<Record<StatName, number>>>({});
  const [loadout, setLoadout] = useState<Echo[]>([]);
  const [pending, setPending] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // Every input stays off until the stored snapshot has loaded, so nothing typed early can be lost or saved over it
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const shownId = useRef(characterId);
  // Overlapping Attributes reads: the most recently started one wins
  const readSeq = useRef(0);
  const appliedAttributesSeq = useRef(0);
  // Read synchronously when several Echo reads land at once; kept in step with `loadout` below
  const loadoutSize = useRef(0);

  const addError = (message: string) => setErrors((list) => [...list, message]);

  // Load the character's Build Snapshot so any device picks up where the last one left off
  useEffect(() => {
    let current = true;
    shownId.current = characterId;
    setStats({});
    setLoadout([]);
    setCritWeapon(true);
    setSavedAt(null);
    setErrors([]);
    setLoaded(false);
    loadedRef.current = false;
    setLoadFailed(false);
    fetch(`/api/snapshot/${characterId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Loading snapshot: ${res.status}`))))
      .then((snapshot) => {
        if (!current) return;
        // Defaults guard against records saved before a field existed
        setStats(snapshot?.stats ?? {});
        setLoadout(snapshot?.loadout ?? []);
        setCritWeapon(snapshot?.critWeapon ?? true);
        setSavedAt(snapshot?.savedAt ?? null);
        setLoaded(true);
        loadedRef.current = true;
      })
      .catch((e: Error) => {
        if (!current) return;
        setLoadFailed(true);
        addError(e.message);
      });
    return () => {
      current = false;
    };
  }, [characterId, loadAttempt]);

  async function save() {
    const id = characterId;
    const res = await fetch(`/api/snapshot/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stats, critWeapon, loadout }),
    }).catch((e: Error) => e);
    if (shownId.current !== id) return; // user switched character mid-save
    if (res instanceof Error) return addError(res.message);
    const body = await res.json().catch(() => ({ error: `Server answered ${res.status}` }));
    if (!res.ok) return addError(body.error);
    setSavedAt(body.savedAt);
  }

  // One screenshot: an Attributes Screenshot fills the stats, an Echo Screenshot joins the Loadout
  async function read(image: File) {
    const id = shownId.current;
    const seq = ++readSeq.current;
    setPending((n) => n + 1);
    const form = new FormData();
    form.append("image", image);
    try {
      const res = await fetch("/api/ocr", { method: "POST", body: form });
      const body = await res.json().catch(() => ({ error: `Server answered ${res.status}` }));
      if (shownId.current !== id) return;
      if (!res.ok) return addError(`${image.name}: ${body.error}`);
      if (body.kind === "attributes") {
        if (seq < appliedAttributesSeq.current) return;
        appliedAttributesSeq.current = seq;
        setStats(body.stats);
      } else {
        const echo: Echo = body.echo;
        if (echo.level !== 25) {
          return addError(`${echo.name ?? "Echo"} is +${echo.level}: only Maxed Echoes (+25) are rated`);
        }
        if (loadoutSize.current >= LOADOUT_SIZE) {
          return addError(`Loadout already has ${LOADOUT_SIZE} Echoes; remove one first`);
        }
        loadoutSize.current++;
        setLoadout((list) => (list.length < LOADOUT_SIZE ? [...list, echo] : list));
      }
    } catch (e) {
      if (shownId.current === id) addError((e as Error).message);
    } finally {
      setPending((n) => n - 1);
    }
  }

  const readAll = (files: Iterable<File>) => {
    if (!loadedRef.current) return addError("Wait for the saved build to load before adding screenshots");
    for (const f of files) if (f.type.startsWith("image/")) read(f);
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => readAll(e.clipboardData?.files ?? []);
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    loadoutSize.current = loadout.length;
  }, [loadout]);

  const updateEcho = (i: number, change: (e: Echo) => Echo) => {
    setLoadout((list) => list.map((e, j) => (j === i ? change(e) : e)));
  };

  const character = characters.find((c) => c.id === characterId);
  const targets = { ...character?.statTargets, ...(critWeapon ? {} : character?.nonCritWeaponTargets) };

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
          <input
            type="checkbox"
            checked={critWeapon}
            disabled={!loaded}
            onChange={(e) => setCritWeapon(e.target.checked)}
          />{" "}
          Crit Weapon
        </label>
      </fieldset>

      <fieldset>
        <legend>Screenshots</legend>
        <p className="paste">
          Press <b>Ctrl+V</b> to paste an Attributes or Echo screenshot, or{" "}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={!loaded}
            onChange={(e) => {
              readAll(e.target.files ?? []);
              e.target.value = ""; // so picking the same file again still triggers a read
            }}
          />
        </p>
        {pending > 0 && <p>Reading {pending} screenshot(s)… (each can take up to 30 seconds)</p>}
        {!loaded && !loadFailed && <p>Loading saved build…</p>}
        {loadFailed && (
          <p>
            <button type="button" onClick={() => setLoadAttempt((n) => n + 1)}>
              Retry loading saved build
            </button>
          </p>
        )}
        {errors.map((message, i) => (
          <p key={i} className="error">
            Error: {message}
          </p>
        ))}
      </fieldset>

      <fieldset className="plain" disabled={!loaded}>
      <h2>Stats</h2>
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
                    onChange={(e) =>
                      setStats({ ...stats, [name]: e.target.value === "" ? undefined : Number(e.target.value) })
                    }
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

      <h2>
        Loadout ({loadout.length}/{LOADOUT_SIZE})
      </h2>
      <div className="scroll">
        <table className="loadout">
          <thead>
            <tr>
              <th>Echo</th>
              <th>Score</th>
              <th>Verdict</th>
              <th>Main Stat</th>
              <th>Substats</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loadout.length === 0 && (
              <tr>
                <td colSpan={6}>No Echoes yet. Paste or upload Echo screenshots (+25 only).</td>
              </tr>
            )}
            {loadout.map((echo, i) => {
              const rating = character ? rateEcho(echo, character, stats) : undefined;
              const score = rating && Number.isFinite(rating.score) ? `${rating.score.toFixed(1)}%` : "—";
              return (
                <tr key={i}>
                  <td>
                    {echo.name ?? "Echo"}
                    <br />
                    Cost{" "}
                    <select
                      value={echo.cost}
                      onChange={(e) => updateEcho(i, (x) => ({ ...x, cost: Number(e.target.value) as EchoCost }))}
                    >
                      {ECHO_COSTS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td>{score}</td>
                  <td className={rating?.verdict}>{rating?.verdict ?? "—"}</td>
                  <td>
                    <select
                      value={echo.mainStat.name}
                      onChange={(e) => updateEcho(i, (x) => ({ ...x, mainStat: { ...x.mainStat, name: e.target.value } }))}
                    >
                      {MAIN_STAT_NAMES.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                    <br />
                    <input
                      type="number"
                      step="0.1"
                      value={shown(echo.mainStat.value)}
                      onChange={(e) =>
                        updateEcho(i, (x) => ({ ...x, mainStat: { ...x.mainStat, value: toNumber(e.target.value) } }))
                      }
                    />
                  </td>
                  <td>
                    {echo.substats.map((s, k) => (
                      <div key={k}>
                        <select
                          value={s.name}
                          onChange={(e) =>
                            updateEcho(i, (x) => ({
                              ...x,
                              substats: x.substats.map((y, m) => (m === k ? { ...y, name: e.target.value as SubstatName } : y)),
                            }))
                          }
                        >
                          {SUBSTATS.map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>{" "}
                        <input
                          type="number"
                          step="0.1"
                          value={shown(s.value)}
                          onChange={(e) =>
                            updateEcho(i, (x) => ({
                              ...x,
                              substats: x.substats.map((y, m) => (m === k ? { ...y, value: toNumber(e.target.value) } : y)),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => setLoadout((list) => list.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      </fieldset>

      <p>
        <button type="button" id="save" onClick={save} disabled={!loaded}>
          Save Build Snapshot
        </button>{" "}
        {savedAt ? `Last saved ${new Date(savedAt).toLocaleString()}` : "Not saved yet"}
      </p>
    </>
  );
}
