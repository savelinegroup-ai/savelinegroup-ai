import { checkReply, conversationIdFrom, readTwilioRequest } from "@/lib/max/phone";

export const runtime = "nodejs";

// Twilio polls here until Max's spoken reply is ready.
export async function POST(req: Request) {
  const params = await readTwilioRequest(req);
  if (!params) return new Response("Invalid signature", { status: 403 });
  const polls = Number(new URL(req.url).searchParams.get("n")) || 0;
  return checkReply(conversationIdFrom(req), params.CallSid ?? "", polls);
}
