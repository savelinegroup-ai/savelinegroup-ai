import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type Anthropic from "@anthropic-ai/sdk";

// Simple JSON-file storage. Fine for a single user running locally; swap for a
// real database (Postgres, Supabase, etc.) before deploying to serverless hosts,
// whose filesystems are ephemeral.

const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.MAX_DATA_DIR ?? "./data");
const BOARD_FILE = path.join(DATA_DIR, "board.json");
const CONVERSATIONS_DIR = path.join(DATA_DIR, "conversations");

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
  try {
    return { ...emptyBoard(), ...JSON.parse(await fs.readFile(BOARD_FILE, "utf8")) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyBoard();
    throw err;
  }
}

export function updateBoard<T>(fn: (board: Board) => T): Promise<T> {
  const run = queue.then(async () => {
    const board = await readBoard();
    const result = fn(board);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(BOARD_FILE, JSON.stringify(board, null, 2));
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

export const newId = () => randomUUID().slice(0, 8);

// Conversation history is stored server-side so thinking blocks and tool
// results are passed back to the API unchanged on every turn.
function conversationFile(id: string) {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) throw new Error("Invalid conversation id");
  return path.join(CONVERSATIONS_DIR, `${id}.json`);
}

export async function loadConversation(id: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
  try {
    return JSON.parse(await fs.readFile(conversationFile(id), "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function saveConversation(id: string, messages: Anthropic.Beta.BetaMessageParam[]) {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
  await fs.writeFile(conversationFile(id), JSON.stringify(messages));
}
