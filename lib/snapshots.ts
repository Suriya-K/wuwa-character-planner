import { STAT_NAMES, type StatName } from "./rating";

export type BuildSnapshot = {
  stats: Partial<Record<StatName, number>>;
  critWeapon: boolean;
  savedAt: string;
};

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
  const { stats, critWeapon } = input as Record<string, unknown>;
  if (typeof critWeapon !== "boolean" || typeof stats !== "object" || stats === null) return null;
  const clean: BuildSnapshot["stats"] = {};
  for (const [name, value] of Object.entries(stats)) {
    if (!(STAT_NAMES as readonly string[]).includes(name) || typeof value !== "number" || !Number.isFinite(value)) return null;
    clean[name as StatName] = value;
  }
  return { stats: clean, critWeapon, savedAt: new Date().toISOString() };
}

export async function saveSnapshot(id: string, snapshot: BuildSnapshot) {
  await redis(["SET", `snapshot:${id}`, JSON.stringify(snapshot)]);
}
