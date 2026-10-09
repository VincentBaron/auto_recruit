import { runAction } from "@/server/store";

// POST /api/actions/<name>: runs one action with the JSON body as payload.
// Answers { ok: true, result, changes } or { ok: false, error }.
export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  let payload: unknown = {};
  const text = await request.text();
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      return Response.json({ ok: false, error: "The request body is not valid JSON." }, { status: 400 });
    }
  }
  const { status, body } = runAction(name, payload, Date.now());
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
