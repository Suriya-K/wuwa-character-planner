"use client";

import { useEffect, useRef, useState } from "react";
import {
  type CharacterBuild,
  type Echo,
  STAT_NAMES,
  type StatName,
  type StatTarget,
  compareEchoes,
  rateEcho,
  statVerdict,
} from "@/lib/rating";
import EchoRow, { formatScore } from "./EchoRow";

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
  const [candidate, setCandidate] = useState<Echo | null>(null);
  const [destination, setDestinationState] = useState<"loadout" | "candidate">("loadout");
  // Read by the paste handler, which is bound once
  const destinationRef = useRef(destination);
  const setDestination = (d: "loadout" | "candidate") => {
    destinationRef.current = d;
    setDestinationState(d);
  };
  const [equippedChoice, setEquippedChoice] = useState<number | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // Bumped on every snapshot load; late OCR/save answers from an earlier load are dropped (A→B→A safe)
  const session = useRef(0);
  const [saving, setSaving] = useState(false);
  // Overlapping Attributes reads: the most recently started one wins
  const readSeq = useRef(0);
  const appliedAttributesSeq = useRef(0);
  // Read synchronously when several Echo reads land at once; kept in step with `loadout` below
  const loadoutSize = useRef(0);

  const addError = (message: string) => setErrors((list) => [...list, message]);

  // Load the character's Build Snapshot so any device picks up where the last one left off
  useEffect(() => {
    let current = true;
    session.current++;
    setEquippedChoice(null);
    setStats({});
    setLoadout([]);
    setCandidate(null);
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
    const mine = session.current;
    setSaving(true);
    const res = await fetch(`/api/snapshot/${characterId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stats, critWeapon, loadout }),
    }).catch((e: Error) => e);
    const body = res instanceof Error ? null : await res.json().catch(() => null);
    setSaving(false);
    if (session.current !== mine) return; // user switched character mid-save
    if (res instanceof Error) return addError(res.message);
    if (!res.ok || typeof body?.savedAt !== "string") return addError(body?.error ?? `Save failed: ${res.status}`);
    setSavedAt(body.savedAt);
  }

  // One screenshot: an Attributes Screenshot fills the stats, an Echo Screenshot joins the Loadout
  async function read(image: File) {
    const mine = session.current;
    const destination = destinationRef.current;
    const seq = ++readSeq.current;
    setPending((n) => n + 1);
    const form = new FormData();
    form.append("image", image);
    try {
      const res = await fetch("/api/ocr", { method: "POST", body: form });
      const body = await res.json().catch(() => ({ error: `Server answered ${res.status}` }));
      if (session.current !== mine) return;
      if (!res.ok) return addError(`${image.name}: ${body.error}`);
      if (body.kind === "attributes") {
        if (seq < appliedAttributesSeq.current) return;
        appliedAttributesSeq.current = seq;
        setStats((prev) => ({ ...prev, ...body.stats }));
      } else {
        const echo: Echo = body.echo;
        if (echo.level !== 25) {
          return addError(`${echo.name ?? "Echo"} is +${echo.level}: only Maxed Echoes (+25) are rated`);
        }
        if (destination === "candidate") return setCandidate(echo);
        if (loadoutSize.current >= LOADOUT_SIZE) {
          return addError(`Loadout already has ${LOADOUT_SIZE} Echoes; remove one first`);
        }
        loadoutSize.current++;
        setLoadout((list) => (list.length < LOADOUT_SIZE ? [...list, echo] : list));
      }
    } catch (e) {
      if (session.current === mine) addError((e as Error).message);
    } finally {
      setPending((n) => n - 1);
    }
  }

  const readAll = (files: Iterable<File>) => {
    const images = [...files].filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    if (!loadedRef.current) return addError("Wait for the saved build to load before adding screenshots");
    images.forEach(read);
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => readAll(e.clipboardData?.files ?? []);
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    loadoutSize.current = loadout.length;
  }, [loadout]);

  // Indices shift when the Loadout changes, so a remembered choice could point at another Echo
  useEffect(() => setEquippedChoice(null), [loadout.length, candidate?.cost]);

  const character = characters.find((c) => c.id === characterId);
  const targets = { ...character?.statTargets, ...(critWeapon ? {} : character?.nonCritWeaponTargets) };
  // Every rating uses the targets for the chosen weapon type, so scores and deltas agree
  const build = character && { ...character, statTargets: targets };

  // Candidate vs the Equipped Echo of the same cost it would replace (preselected when only one fits)
  const sameCost = candidate ? loadout.flatMap((e, i) => (e.cost === candidate.cost ? [i] : [])) : [];
  const equippedIndex = equippedChoice !== null && sameCost.includes(equippedChoice) ? equippedChoice : sameCost[0];
  const comparison = (() => {
    if (!candidate || !build || equippedIndex === undefined) return undefined;
    const equipped = loadout[equippedIndex];
    const result = compareEchoes(candidate, equipped, stats, build);
    const swapped = Object.fromEntries(Object.entries(result.whatIf).map(([n, w]) => [n, w.after]));
    return {
      ...result,
      swapped,
      candidateScore: rateEcho(candidate, build, swapped).score,
      equippedScore: rateEcho(equipped, build, stats).score,
    };
  })();

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
                      setStats((prev) => ({ ...prev, [name]: e.target.value === "" ? undefined : Number(e.target.value) }))
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
                        // Same fallback as `targets`: non-Crit values only when some source gave them
                        const nonCrit = !critWeapon && CRIT.has(name) && character.nonCritWeaponTargets[name];
                        const t = nonCrit ? src.nonCritWeaponTargets[name] : src.statTargets[name];
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
            {loadout.map((echo, i) => (
              <EchoRow
                key={i}
                echo={echo}
                rating={build && rateEcho(echo, build, stats)}
                onChange={(next) => setLoadout((list) => list.map((e, j) => (j === i ? next : e)))}
                actions={
                  <button type="button" onClick={() => setLoadout((list) => list.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      <h2>Candidate Echo</h2>
      <p>
        Echo screenshots go to:{" "}
        <label>
          <input type="radio" checked={destination === "loadout"} onChange={() => setDestination("loadout")} /> Loadout
        </label>{" "}
        <label>
          <input type="radio" checked={destination === "candidate"} onChange={() => setDestination("candidate")} />{" "}
          Candidate
        </label>
      </p>
      {!candidate ? (
        <p>No Candidate Echo. Choose "Candidate" above, then paste or upload the Echo you are considering.</p>
      ) : (
        <>
          <div className="scroll">
            <table className="loadout">
              <tbody>
                <EchoRow
                  echo={candidate}
                  rating={comparison && build && rateEcho(candidate, build, comparison.swapped)}
                  onChange={setCandidate}
                  actions={
                    <button type="button" onClick={() => setCandidate(null)}>
                      Discard
                    </button>
                  }
                />
              </tbody>
            </table>
          </div>
          {sameCost.length === 0 ? (
            <p>No Equipped Echo with cost {candidate.cost} to compare against.</p>
          ) : (
            <>
              <p>
                Replaces{" "}
                <select value={equippedIndex} onChange={(e) => setEquippedChoice(Number(e.target.value))}>
                  {sameCost.map((i) => (
                    <option key={i} value={i}>
                      #{i + 1} {loadout[i].name ?? "Echo"} ({formatScore(build && rateEcho(loadout[i], build, stats).score)})
                    </option>
                  ))}
                </select>
              </p>
              {comparison && (
                <>
                  <p>
                    Candidate {formatScore(comparison.candidateScore)} vs Equipped {formatScore(comparison.equippedScore)}:{" "}
                    <b className={comparison.scoreDelta > 0 ? "Keep" : comparison.scoreDelta < 0 ? "Replace" : undefined}>
                      {comparison.scoreDelta > 0 ? "+" : ""}
                      {formatScore(comparison.scoreDelta)}
                    </b>
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Stat</th>
                        <th>Now</th>
                        <th>After swap</th>
                        <th>Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(comparison.whatIf).map(([name, w]) => (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>{w.before.toFixed(1)}%</td>
                          <td>{w.after.toFixed(1)}%</td>
                          <td className={w.verdict}>{w.verdict}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p>
                    <button
                      type="button"
                      onClick={() => {
                        setLoadout((list) => list.map((e, j) => (j === equippedIndex ? candidate : e)));
                        setCandidate(null);
                      }}
                    >
                      Swap into Loadout
                    </button>{" "}
                    (then Save to keep it)
                  </p>
                </>
              )}
            </>
          )}
        </>
      )}

      </fieldset>

      <p>
        <button type="button" id="save" onClick={save} disabled={!loaded || saving}>
          Save Build Snapshot
        </button>{" "}
        {savedAt ? `Last saved ${new Date(savedAt).toLocaleString()}` : "Not saved yet"}
      </p>
    </>
  );
}
