# Max — AI Manager

Max is an AI manager for Saveline Group. You chat with Max in a web app. Max:

- tracks the team's work on a task board,
- assigns tasks based on each person's role and workload,
- gives briefings and priorities,
- flags work that is overdue, blocked, or has no owner,
- remembers facts about the business between conversations.

It's built with Next.js and the Claude API (Claude Opus 5.5 with tool use, streamed to the browser).

## Run it

```bash
npm install
cp .env.example .env.local   # then paste your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. Some things to try:

- "Add Sarah to the team as our marketing lead"
- "Sarah needs to launch the fall campaign by Friday, high priority"
- "Give me today's briefing"
- "Remember that our busy season is March through June"

## How it works

| File | What it does |
| --- | --- |
| `lib/max/prompt.ts` | Max's personality and how Max works. Edit this to change Max's behavior. |
| `lib/max/tools.ts` | What Max can do: create, list, update, and delete tasks; add and list team members; remember and forget facts. |
| `lib/max/agent.ts` | The agent loop. It uses the SDK tool runner, streams the reply, and handles refusals and fallbacks. |
| `lib/max/store.ts` | JSON storage for the board, team, memories, and conversations. It uses Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, and local files in `./data` otherwise. |
| `app/api/chat/route.ts` | Streams Max's replies to the browser as NDJSON. |
| `lib/max/auth.ts` | Password login. Set `MAX_PASSWORD` to turn it on. |
| `app/page.tsx` | The chat UI, with a live sidebar showing the task board. |

To give Max a new ability, add a `betaZodTool` to `lib/max/tools.ts`, for example sending email or reading your calendar.

## Deploying

Max is deployed on Vercel from this repository, and every push redeploys it. Set these environment variables on the Vercel project:

- `ANTHROPIC_API_KEY`: your Claude API key
- `MAX_PASSWORD`: the password for logging in to Max
- `BLOB_READ_WRITE_TOKEN`: set automatically when the Vercel Blob store is connected

On Netlify, set `MAX_STORAGE=netlify` instead of the Blob token, and Max stores its data in Netlify Blobs.

## Discord

Max answers the `/max <message>` command in any channel of your server, using the same board, team, and memory as the web app. Each channel keeps its own conversation, and `/maxreset` starts a fresh one in the current channel.

1. Create an application at https://discord.com/developers/applications. Copy its **Application ID** and **Public Key**, then open the **Bot** page and copy the **Token**.
2. Add `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, and `DISCORD_ALLOWED_USER_IDS` (your Discord user ID) to the hosting environment, then redeploy.
3. In the developer portal, set **Interactions Endpoint URL** to `https://<your-max-site>/api/discord` and save.
4. Invite the app to your server: on **OAuth2 → URL Generator**, tick `applications.commands`, then open the generated URL.
5. Log in to Max on the web, then visit `https://<your-max-site>/api/discord/register` once to add the commands.
