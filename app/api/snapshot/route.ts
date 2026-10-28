import { listSnapshotIds } from "@/lib/snapshots";

// Characters that have a saved Build Snapshot
export async function GET() {
  try {
    return Response.json(await listSnapshotIds());
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
