import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { runMax } from "./agent";
import { readJson, writeJson } from "./store";

// Morning phone calls through Twilio. Max writes a spoken briefing, calls the
// owner, then keeps listening so the owner can talk back. Twilio only waits
// ~15 seconds for a webhook, so each spoken request runs in the background
// while the call plays a short pause and polls /api/voice/wait for the reply.

const VOICE = "Polly.Matthew";

const PHONE_STYLE =
  "[This is a phone call. Reply in plain spoken sentences: no lists, markdown, emoji, or ids. " +
  "Keep it brief and natural.]";

const BRIEFING_PROMPT =
  `${PHONE_STYLE}\nIt's the morning phone briefing. Check the board and team, then give me today's briefing ` +
  "in under a minute: what's most important today, anything overdue or blocked, and anyone overloaded. " +
  "End by asking if there's anything I want you to do.";

// Only a whole utterance like "no, that's all, thanks" ends the call, so
// "no, move the meeting to Friday" still goes to Max.
const GOODBYE =
  /^((no|nope|nothing|no thanks?|that'?s (it|all)|i'?m good|all good|we'?re good|bye|goodbye|thanks?|thank you)( |$))+$/;
const isGoodbye = (speech: string) =>
  GOODBYE.test(speech.toLowerCase().replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim() + " ");

function config() {
  const env = {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: process.env.MAX_OWNER_PHONE,
    baseUrl: process.env.MAX_PUBLIC_URL?.replace(/\/$/, ""),
  };
  const missing = Object.entries({
    TWILIO_ACCOUNT_SID: env.sid,
    TWILIO_AUTH_TOKEN: env.token,
    TWILIO_PHONE_NUMBER: env.from,
    MAX_OWNER_PHONE: env.to,
    MAX_PUBLIC_URL: env.baseUrl,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) throw new Error(`Missing settings: ${missing.join(", ")}`);
  return env as { [K in keyof typeof env]: string };
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const say = (text: string) => `<Say voice="${VOICE}">${escapeXml(text)}</Say>`;

export const twiml = (inner: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });

function listen(conversationId: string, baseUrl: string) {
  const action = escapeXml(`${baseUrl}/api/voice/respond?c=${conversationId}`);
  return (
    `<Gather input="speech" speechTimeout="auto" timeout="8" action="${action}" method="POST"></Gather>` +
    say("Okay, talk soon. Have a great day.") +
    "<Hangup/>"
  );
}

async function collectReply(conversationId: string, text: string) {
  let reply = "";
  for await (const event of runMax(conversationId, text)) {
    if (event.type === "text") reply += event.text;
    else if (event.type === "error") reply += " Sorry, something went wrong on my end.";
  }
  return reply.trim() || "Sorry, I don't have anything to say to that.";
}

/** Write today's briefing and place the call. */
export async function startMorningCall() {
  const { sid, token, from, to, baseUrl } = config();
  const conversationId = `phone-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  const briefing = await collectReply(conversationId, BRIEFING_PROMPT);

  const body = new URLSearchParams({
    To: to,
    From: from,
    Twiml: `<Response><Pause length="1"/>${say(`Good morning, it's Max. ${briefing}`)}${listen(conversationId, baseUrl)}</Response>`,
  });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
    body,
  });
  if (!res.ok) throw new Error(`Twilio couldn't place the call: ${res.status} ${await res.text()}`);
}

/**
 * Check X-Twilio-Signature: base64 HMAC-SHA1 of the full URL followed by each
 * POST parameter's name and value, sorted by name.
 */
export async function readTwilioRequest(req: Request) {
  const { token, baseUrl } = config();
  const params = Object.fromEntries(new URLSearchParams(await req.text()));
  const { pathname, search } = new URL(req.url);
  const url = baseUrl + pathname + search;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const expected = createHmac("sha1", token).update(data).digest("base64");
  const given = req.headers.get("x-twilio-signature") ?? "";
  const valid =
    expected.length === given.length && timingSafeEqual(Buffer.from(expected), Buffer.from(given));
  return valid ? params : null;
}

const pendingKey = (callSid: string) => `voice/${callSid.replace(/[^a-zA-Z0-9]/g, "")}.json`;

interface Pending {
  status: "working" | "ready";
  reply?: string;
}

export function conversationIdFrom(req: Request) {
  const id = new URL(req.url).searchParams.get("c") ?? "";
  if (!/^phone-[a-zA-Z0-9-]{1,48}$/.test(id)) throw new Error("Invalid conversation");
  return id;
}

/** Handle what the owner said. Returns TwiML plus background work to run after responding. */
export async function handleSpeech(conversationId: string, callSid: string, speech: string) {
  const { baseUrl } = config();
  if (!speech.trim() || isGoodbye(speech)) {
    return { response: twiml(say("Sounds good. Have a great day.") + "<Hangup/>") };
  }
  await writeJson(pendingKey(callSid), { status: "working" } satisfies Pending);
  const work = async () => {
    let reply: string;
    try {
      reply = await collectReply(conversationId, `${PHONE_STYLE}\n${speech}`);
    } catch (err) {
      console.error("Phone reply failed", err);
      reply = "Sorry, something went wrong on my end.";
    }
    await writeJson(pendingKey(callSid), { status: "ready", reply } satisfies Pending);
  };
  const wait = escapeXml(`${baseUrl}/api/voice/wait?c=${conversationId}&n=0`);
  return {
    response: twiml(say("One moment.") + `<Redirect method="POST">${wait}</Redirect>`),
    work,
  };
}

// About two minutes of polling before giving up on a reply.
const MAX_POLLS = 50;

/** Poll for Max's reply while the caller hears a short pause. */
export async function checkReply(conversationId: string, callSid: string, polls: number) {
  const { baseUrl } = config();
  const pending = await readJson<Pending>(pendingKey(callSid));
  if (pending?.status === "ready") {
    await writeJson(pendingKey(callSid), { status: "working" } satisfies Pending);
    return twiml(say(pending.reply ?? "") + listen(conversationId, baseUrl));
  }
  if (polls >= MAX_POLLS) {
    return twiml(say("Sorry, that's taking too long. Try asking me again.") + listen(conversationId, baseUrl));
  }
  const wait = escapeXml(`${baseUrl}/api/voice/wait?c=${conversationId}&n=${polls + 1}`);
  return twiml(`<Pause length="2"/><Redirect method="POST">${wait}</Redirect>`);
}
