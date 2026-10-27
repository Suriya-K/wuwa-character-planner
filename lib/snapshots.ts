import { ECHO_COSTS, type Echo, MAIN_STAT_NAMES, MAX_ROLL, STAT_NAMES, type StatName, type SubstatName } from "./rating";

export type BuildSnapshot = {
  stats: Partial<Record<StatName, number>>;
  critWeapon: boolean;
  loadout: Echo[];
  savedAt: string;
};

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

// Only Maxed Echoes go into a Loadout (ticket 05), at most five
function parseEcho(input: unknown): Echo | null {
  if (typeof input !== "object" || input === null) return null;
  const { name, cost, level, mainStat, substats } = input as Record<string, any>;
  if (!ECHO_COSTS.includes(cost) || level !== 25) return null;
  if (!MAIN_STAT_NAMES.includes(mainStat?.name) || !num(mainStat?.value)) return null;
  if (!Array.isArray(substats) || substats.length > 5) return null;
  if (!substats.every((s) => Object.hasOwn(MAX_ROLL, s?.name) && num(s?.value))) return null;
  return {
    ...(typeof name === "string" && { name: name.slice(0, 80) }),
    cost,
    level,
    mainStat: { name: mainStat.name, value: mainStat.value },
    substats: substats.map((s) => ({ name: s.name as SubstatName, value: s.value })),
  };
}

export const isCharacterId = (id: string) => /^[a-z0-9-]{1,64}$/.test(id);

// ponytail: two Redis commands over Upstash's REST API; swap for @upstash/redis if we need more
async function redis(command: (string | number)[]) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("KV_REST_API_URL / KV_REST_API_TOKEN are not set");
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const body = res.ok ? await res.json().catch(() => null) : null;
  if (!body || body.error) throw new Error(`Redis ${command[0]} failed: ${body?.error ?? res.status}`);
  return body.result;
}

export async function getSnapshot(id: string): Promise<BuildSnapshot | null> {
  const raw = await redis(["GET", `snapshot:${id}`]);
  return raw ? JSON.parse(raw) : null;
}

// Validates untrusted input from the browser before it is stored
export function parseSnapshot(input: unknown): BuildSnapshot | null {
  if (typeof input !== "object" || input === null) return null;
  const { stats, critWeapon, loadout = [] } = input as Record<string, unknown>;
  if (!Array.isArray(loadout) || loadout.length > 5) return null;
  const echoes = loadout.map(parseEcho);
  if (echoes.some((e) => e === null)) return null;
  if (typeof critWeapon !== "boolean" || typeof stats !== "object" || stats === null) return null;
  const clean: BuildSnapshot["stats"] = {};
  for (const [name, value] of Object.entries(stats)) {
    if (!(STAT_NAMES as readonly string[]).includes(name) || !num(value)) return null;
    clean[name as StatName] = value;
  }
  return { stats: clean, critWeapon, loadout: echoes as Echo[], savedAt: new Date().toISOString() };
}

export async function saveSnapshot(id: string, snapshot: BuildSnapshot) {
  await redis(["SET", `snapshot:${id}`, JSON.stringify(snapshot)]);
}
