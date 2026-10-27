import { generateJson } from "@/lib/gemini";
import { ECHO_COSTS, MAIN_STAT_NAMES, STAT_NAMES, SUBSTAT_NAMES as SUBSTATS, type StatName, type SubstatName } from "@/lib/rating";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 4_000_000;

// Prompt validated against Thai-client screenshots in the prototype (ADR 0001)
const PROMPT = `This is a Wuthering Waves screenshot, possibly from a Thai-language client. It is either the character Attributes screen or an Echo detail screen.
Attributes screen: kind "attributes", fill stats using these English names: ${STAT_NAMES.join(", ")}. ฟื้นฟูพลังงาน is Energy Regen.
Echo screen: kind "echo", fill name (English echo name), cost (1, 3 or 4), level (the +N number), mainStat, substats.
  The first two highlighted rows with icons are the Main Stat and a fixed secondary stat; ignore the second one.
  Substats are the rows marked with a small "+" sparkle. A value with % is ATK%/HP%/DEF%; without % it is flat ATK/HP/DEF.
  โบนัส DMG โจมตีปกติ = Basic Attack DMG Bonus, โจมตีหนัก = Heavy Attack, ทักษะ = Resonance Skill, ปลดปล่อย = Resonance Liberation.
Anything else: kind "other". Numbers without % signs.`;

const statValue = (names: readonly string[], nullable = false) => ({
  type: "object",
  nullable,
  properties: { name: { type: "string", enum: names }, value: { type: "number" } },
  required: ["name", "value"],
});
const SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["attributes", "echo", "other"] },
    stats: { type: "array", items: statValue(STAT_NAMES) },
    name: { type: "string", nullable: true },
    cost: { type: "integer", nullable: true }, // Gemini enums are string-only; checked below
    level: { type: "integer", nullable: true },
    mainStat: statValue(MAIN_STAT_NAMES, true),
    substats: { type: "array", items: statValue(SUBSTATS) },
  },
  // Gemini drops optional fields, so everything is required and nullable where it may not apply
  required: ["kind", "stats", "name", "cost", "level", "mainStat", "substats"],
};

type Read = {
  kind: "attributes" | "echo" | "other";
  stats?: { name: StatName; value: number }[];
  name?: string | null;
  cost?: 1 | 3 | 4 | null;
  level?: number | null;
  mainStat?: { name: string; value: number } | null;
  substats?: { name: SubstatName; value: number }[];
};

export async function POST(req: Request) {
  // Refuse oversized bodies before buffering them
  if (Number(req.headers.get("content-length")) > MAX_BYTES + 10_000) {
    return Response.json({ error: "Image over 4 MB" }, { status: 413 });
  }
  const image = (await req.formData()).get("image");
  if (!(image instanceof File) || !IMAGE_TYPES.includes(image.type)) {
    return Response.json({ error: "Expected a PNG, JPEG or WebP screenshot" }, { status: 400 });
  }
  if (image.size > MAX_BYTES) return Response.json({ error: "Image over 4 MB" }, { status: 413 });
  const data = Buffer.from(await image.arrayBuffer()).toString("base64");
  try {
    const r = await generateJson<Read>([{ text: PROMPT }, { inline_data: { mime_type: image.type, data } }], SCHEMA);
    if (r.kind === "attributes") {
      return Response.json({ kind: "attributes", stats: Object.fromEntries((r.stats ?? []).map((s) => [s.name, s.value])) });
    }
    if (r.kind === "echo" && ECHO_COSTS.includes(r.cost as never) && r.mainStat) {
      const { name, cost, level, mainStat, substats = [] } = r;
      if (substats.length > 5) {
        return Response.json({ error: `Read ${substats.length} substats from ${name ?? "this Echo"}; expected at most 5` }, { status: 422 });
      }
      return Response.json({ kind: "echo", echo: { name: name ?? undefined, cost, level: level ?? 0, mainStat, substats } });
    }
    return Response.json({ error: "Not an Attributes or Echo screenshot" }, { status: 422 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
