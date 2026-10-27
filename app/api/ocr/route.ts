import { generateJson } from "@/lib/gemini";
import { STAT_NAMES, type StatName } from "@/lib/rating";

const STATS = [...STAT_NAMES];

// Prompt validated against Thai-client screenshots in the prototype (ADR 0001)
const PROMPT = `This is the character Attributes screen of Wuthering Waves, possibly from a Thai-language client.
Return every stat shown, using these English names: ${STATS.join(", ")}.
ฟื้นฟูพลังงาน is Energy Regen. Percent values as numbers without the % sign. Omit stats that are not shown.`;

const SCHEMA = {
  type: "object",
  properties: {
    stats: {
      type: "array",
      items: {
        type: "object",
        properties: { stat: { type: "string", enum: STATS }, value: { type: "number" } },
        required: ["stat", "value"],
      },
    },
  },
  required: ["stats"],
};

export async function POST(req: Request) {
  const image = (await req.formData()).get("image");
  if (!(image instanceof File) || !image.type.startsWith("image/")) {
    return Response.json({ error: "Expected an image file" }, { status: 400 });
  }
  if (image.size > 4_000_000) return Response.json({ error: "Image over 4 MB" }, { status: 413 });
  const data = Buffer.from(await image.arrayBuffer()).toString("base64");
  try {
    const { stats } = await generateJson<{ stats: { stat: StatName; value: number }[] }>(
      [{ text: PROMPT }, { inline_data: { mime_type: image.type, data } }],
      SCHEMA,
    );
    return Response.json(Object.fromEntries(stats.map((s) => [s.stat, s.value])));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
