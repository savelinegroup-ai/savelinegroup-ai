import { after } from "next/server";
import { conversationIdFrom, handleSpeech, readTwilioRequest } from "@/lib/max/phone";

export const runtime = "nodejs";
export const maxDuration = 300;

// Twilio posts here with what the caller said.
export async function POST(req: Request) {
  const params = await readTwilioRequest(req);
  if (!params) return new Response("Invalid signature", { status: 403 });
  const { response, work } = await handleSpeech(
    conversationIdFrom(req),
    params.CallSid ?? "",
    params.SpeechResult ?? "",
  );
  if (work) after(work);
  return response;
}
