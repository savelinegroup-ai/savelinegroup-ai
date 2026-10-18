import { isAuthed, unauthorized } from "@/lib/max/auth";
import { registerCommands } from "@/lib/max/discord";

export const runtime = "nodejs";

// Visit this URL once (while logged in to Max) to add /max and /maxreset to Discord.
export async function GET(req: Request) {
  if (!isAuthed(req)) return unauthorized();
  try {
    await registerCommands();
    return new Response("Done! /max and /maxreset are now available in your Discord server.");
  } catch (err) {
    return new Response(`Couldn't register commands: ${(err as Error).message}`, { status: 500 });
  }
}
