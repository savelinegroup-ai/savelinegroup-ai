import { isAuthed, unauthorized } from "@/lib/max/auth";
import { startMorningCall } from "@/lib/max/phone";

export const runtime = "nodejs";
export const maxDuration = 300;

// "Call me now" button in the web app.
export async function POST(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  try {
    await startMorningCall();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
