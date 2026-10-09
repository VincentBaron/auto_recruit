import { connection } from "next/server";
import { readClientState } from "@/server/store";

// GET /api/state: the full state of the dummy backend, with derived values. Never cached.
export async function GET() {
  await connection();
  return Response.json(readClientState(Date.now()), { headers: { "cache-control": "no-store" } });
}
