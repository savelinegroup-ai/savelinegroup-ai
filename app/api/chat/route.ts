import { runMax } from "@/lib/max/agent";
import { isAuthed, unauthorized } from "@/lib/max/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  const { conversationId, message } = await req.json();
  if (typeof conversationId !== "string" || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "conversationId and message are required" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runMax(conversationId, message)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(JSON.stringify({ type: "error", message: msg }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
