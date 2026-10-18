import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { get, put } from "@vercel/blob";
import type Anthropic from "@anthropic-ai/sdk";

// JSON storage. When a Vercel Blob store is connected (BLOB_READ_WRITE_TOKEN is
// set), data lives in private blobs so it survives serverless restarts.
// Otherwise it falls back to local files in MAX_DATA_DIR for development.

const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.MAX_DATA_DIR ?? "./data");
const useBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

async function readJson<T>(name: string): Promise<T | undefined> {
  if (useBlob()) {
    const result = await get(name, { access: "private", useCache: false });
    if (!result?.stream) return undefined;
    return JSON.parse(await new Response(result.stream).text());
  }
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, name), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

async function writeJson(name: string, data: unknown) {
  const body = JSON.stringify(data);
  if (useBlob()) {
    await put(name, body, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "application/json",
    });
    return;
  }
  const file = path.join(DATA_DIR, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, body);
}

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type Priority = "low" | "medium" | "high" | "urgent";

export interface Task {
  id: string;
  title: string;
  description?: string;
  owner?: string;
  project?: string;
  priority: Priority;
  status: TaskStatus;
  due?: string;
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email?: string;
  notes?: string;
}

export interface Memory {
  id: string;
  fact: string;
  createdAt: string;
}

export interface Board {
  tasks: Task[];
  team: TeamMember[];
  memories: Memory[];
}

const emptyBoard = (): Board => ({ tasks: [], team: [], memories: [] });

// Serialize writes so concurrent tool calls don't clobber each other.
let queue: Promise<unknown> = Promise.resolve();

export async function readBoard(): Promise<Board> {
  return { ...emptyBoard(), ...(await readJson<Board>("board.json")) };
}

export function updateBoard<T>(fn: (board: Board) => T): Promise<T> {
  const run = queue.then(async () => {
    const board = await readBoard();
    const result = fn(board);
    await writeJson("board.json", board);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export const newId = () => randomUUID().slice(0, 8);

// Conversation history is stored server-side so thinking blocks and tool
// results are passed back to the API unchanged on every turn.
function conversationName(id: string) {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) throw new Error("Invalid conversation id");
  return `conversations/${id}.json`;
}

export async function loadConversation(id: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
  return (await readJson<Anthropic.Beta.BetaMessageParam[]>(conversationName(id))) ?? [];
}

export async function saveConversation(id: string, messages: Anthropic.Beta.BetaMessageParam[]) {
  await writeJson(conversationName(id), messages);
}
