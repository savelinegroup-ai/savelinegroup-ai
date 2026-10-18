import { readBoard } from "@/lib/max/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await readBoard());
}
