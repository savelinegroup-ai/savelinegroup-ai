import { isAuthed, unauthorized } from "@/lib/max/auth";
import { readBoard } from "@/lib/max/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  return Response.json(await readBoard());
}
