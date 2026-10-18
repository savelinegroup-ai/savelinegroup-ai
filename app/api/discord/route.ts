import { after } from "next/server";
import {
  answerInteraction,
  isAllowedUser,
  resetChannel,
  verifyDiscordRequest,
} from "@/lib/max/discord";

export const runtime = "nodejs";
export const maxDuration = 300;

const PING = 1;
const APPLICATION_COMMAND = 2;
const PONG = 1;
const CHANNEL_MESSAGE = 4;
const DEFERRED_CHANNEL_MESSAGE = 5;
const EPHEMERAL = 64;

export async function POST(req: Request) {
  const body = await req.text();
  const valid = verifyDiscordRequest(
    body,
    req.headers.get("x-signature-ed25519"),
    req.headers.get("x-signature-timestamp"),
  );
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const interaction = JSON.parse(body);
  if (interaction.type === PING) return Response.json({ type: PONG });
  if (interaction.type !== APPLICATION_COMMAND) return new Response("Unsupported", { status: 400 });

  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!isAllowedUser(userId)) {
    return Response.json({
      type: CHANNEL_MESSAGE,
      data: { content: "Sorry, only the owner can talk to Max.", flags: EPHEMERAL },
    });
  }

  const channelId: string = interaction.channel_id ?? interaction.channel?.id;

  if (interaction.data.name === "maxreset") {
    await resetChannel(channelId);
    return Response.json({
      type: CHANNEL_MESSAGE,
      data: { content: "Fresh start. Your tasks, team, and memories are still saved." },
    });
  }

  if (interaction.data.name === "max") {
    const message: string =
      interaction.data.options?.find((o: { name: string }) => o.name === "message")?.value ?? "";
    // Discord needs an answer within 3 seconds, so acknowledge now and reply when Max is done.
    after(() => answerInteraction(interaction.application_id, interaction.token, channelId, message));
    return Response.json({ type: DEFERRED_CHANNEL_MESSAGE });
  }

  return new Response("Unknown command", { status: 400 });
}
