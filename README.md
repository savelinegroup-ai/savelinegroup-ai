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
| `lib/max/store.ts` | JSON-file storage in `./data` for the board, team, memories, and conversations. |
| `app/api/chat/route.ts` | Streams Max's replies to the browser as NDJSON. |
| `app/page.tsx` | The chat UI, with a live sidebar showing the task board. |

To give Max a new ability, add a `betaZodTool` to `lib/max/tools.ts`, for example sending email or reading your calendar.

## Deploying

The JSON-file store suits one person running Max locally. Serverless hosts like Vercel wipe their filesystem between runs, so replace `lib/max/store.ts` with a real database (Postgres, Supabase, etc.) before deploying. Also add authentication, because anyone with the URL could otherwise talk to Max and spend your API credits.
