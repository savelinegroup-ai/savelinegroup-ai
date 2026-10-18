import { startMorningCall } from "@/lib/max/phone";

export const runtime = "nodejs";
export const maxDuration = 300;

// Vercel Cron calls this on the schedule in vercel.json, sending CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    await startMorningCall();
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Morning call failed", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
