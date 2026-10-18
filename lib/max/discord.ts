import { createPublicKey, verify } from "crypto";
import { runMax } from "./agent";
import { saveConversation } from "./store";

// Discord slash-command integration over HTTP interactions, so it runs on
// serverless hosts without a long-lived gateway connection.

const API = "https://discord.com/api/v10";
const MESSAGE_LIMIT = 2000;

export const COMMANDS = [
  {
    name: "max",
    description: "Talk to Max, your AI manager",
    options: [{ type: 3, name: "message", description: "What you want to tell or ask Max", required: true }],
  },
  {
    name: "maxreset",
    description: "Start a fresh conversation with Max in this channel (tasks and memory are kept)",
  },
];

// Ed25519 public keys in SPKI DER form are a fixed 12-byte prefix plus the raw key.
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordRequest(body: string, signature: string | null, timestamp: string | null) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey || !signature || !timestamp) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([SPKI_PREFIX, Buffer.from(publicKey, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export function isAllowedUser(userId: string | undefined) {
  const allowed = process.env.DISCORD_ALLOWED_USER_IDS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed?.length) return true;
  return Boolean(userId && allowed.includes(userId));
}

export const conversationIdForChannel = (channelId: string) => `discord-${channelId}`;

export async function resetChannel(channelId: string) {
  await saveConversation(conversationIdForChannel(channelId), []);
}

function splitMessage(text: string) {
  const chunks: string[] = [];
  let rest = text.trim() || "(no reply)";
  while (rest.length > MESSAGE_LIMIT) {
    let cut = rest.lastIndexOf("\n", MESSAGE_LIMIT);
    if (cut < MESSAGE_LIMIT / 2) cut = MESSAGE_LIMIT;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  chunks.push(rest);
  return chunks;
}

async function discordFetch(path: string, method: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`Discord ${method} ${path} failed: ${res.status} ${await res.text()}`);
}

/** Run Max for a deferred /max interaction and post the reply back to Discord. */
export async function answerInteraction(applicationId: string, token: string, channelId: string, message: string) {
  let reply = "";
  for await (const event of runMax(conversationIdForChannel(channelId), message)) {
    if (event.type === "text") reply += event.text;
    else if (event.type === "error") reply += `\n\n⚠ ${event.message}`;
  }

  const [first, ...more] = splitMessage(reply);
  const webhook = `/webhooks/${applicationId}/${token}`;
  await discordFetch(`${webhook}/messages/@original`, "PATCH", { content: first });
  for (const content of more) await discordFetch(webhook, "POST", { content });
}

export async function registerCommands() {
  const appId = process.env.DISCORD_APPLICATION_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!appId || !botToken) throw new Error("Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN first");
  const res = await fetch(`${API}/applications/${appId}/commands`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bot ${botToken}` },
    body: JSON.stringify(COMMANDS),
  });
  if (!res.ok) throw new Error(`Discord rejected the commands: ${res.status} ${await res.text()}`);
}
