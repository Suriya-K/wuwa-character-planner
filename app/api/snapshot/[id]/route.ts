import { getSnapshot, isCharacterId, parseSnapshot, saveSnapshot } from "@/lib/snapshots";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  const { id } = await params;
  if (!isCharacterId(id)) return Response.json({ error: "Bad character id" }, { status: 400 });
  try {
    return Response.json(await getSnapshot(id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  if (!isCharacterId(id)) return Response.json({ error: "Bad character id" }, { status: 400 });
  const snapshot = parseSnapshot(await req.json().catch(() => null));
  if (!snapshot) return Response.json({ error: "Bad Build Snapshot" }, { status: 400 });
  try {
    await saveSnapshot(id, snapshot);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
  return Response.json(snapshot);
}
