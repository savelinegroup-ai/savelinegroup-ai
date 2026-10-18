import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { newId, readBoard, updateBoard, type Task } from "./store";

const priority = z.enum(["low", "medium", "high", "urgent"]);
const status = z.enum(["todo", "in_progress", "blocked", "done"]);

const now = () => new Date().toISOString();

function formatTask(t: Task) {
  return [
    `[${t.id}] ${t.title}`,
    `status=${t.status}`,
    `priority=${t.priority}`,
    t.owner && `owner=${t.owner}`,
    t.project && `project=${t.project}`,
    t.due && `due=${t.due}`,
  ]
    .filter(Boolean)
    .join(" | ");
}

const tools = [
  betaZodTool({
    name: "create_task",
    description:
      "Create a new task on the team board. Use when the user asks to track, assign, or remember a piece of work.",
    inputSchema: z.object({
      title: z.string().describe("Short, action-oriented task title"),
      description: z.string().optional(),
      owner: z.string().optional().describe("Name of the person responsible"),
      project: z.string().optional(),
      priority: priority.optional().describe("Defaults to medium"),
      due: z.string().optional().describe("Due date in YYYY-MM-DD format"),
    }),
    run: async (input) => {
      const task = await updateBoard((board) => {
        const t: Task = {
          id: newId(),
          ...input,
          priority: input.priority ?? "medium",
          status: "todo",
          notes: [],
          createdAt: now(),
          updatedAt: now(),
        };
        board.tasks.push(t);
        return t;
      });
      return `Created: ${formatTask(task)}`;
    },
  }),

  betaZodTool({
    name: "list_tasks",
    description:
      "List tasks on the board, optionally filtered. Call this before giving status updates, briefings, or prioritization advice.",
    inputSchema: z.object({
      status: status.optional(),
      owner: z.string().optional(),
      project: z.string().optional(),
      include_done: z.boolean().optional().describe("Include completed tasks (default false)"),
    }),
    run: async ({ status, owner, project, include_done }) => {
      const { tasks } = await readBoard();
      const match = (a?: string, b?: string) => !b || a?.toLowerCase() === b.toLowerCase();
      const found = tasks.filter(
        (t) =>
          (status ? t.status === status : include_done || t.status !== "done") &&
          match(t.owner, owner) &&
          match(t.project, project),
      );
      if (found.length === 0) return "No matching tasks.";
      return found
        .map((t) => formatTask(t) + (t.notes.length ? `\n  notes: ${t.notes.join(" / ")}` : ""))
        .join("\n");
    },
  }),

  betaZodTool({
    name: "update_task",
    description:
      "Update a task: change status, owner, priority, due date, or add a progress note. Requires the task id from list_tasks.",
    inputSchema: z.object({
      id: z.string(),
      title: z.string().optional(),
      status: status.optional(),
      owner: z.string().optional(),
      project: z.string().optional(),
      priority: priority.optional(),
      due: z.string().optional(),
      note: z.string().optional().describe("Progress note to append"),
    }),
    run: async ({ id, note, ...changes }) => {
      const task = await updateBoard((board) => {
        const t = board.tasks.find((t) => t.id === id);
        if (!t) return undefined;
        for (const [k, v] of Object.entries(changes)) if (v !== undefined) Object.assign(t, { [k]: v });
        if (note) t.notes.push(`${now().slice(0, 10)}: ${note}`);
        t.updatedAt = now();
        return t;
      });
      if (!task) throw new Error(`No task with id ${id}`);
      return `Updated: ${formatTask(task)}`;
    },
  }),

  betaZodTool({
    name: "delete_task",
    description: "Permanently delete a task. Only use when the user explicitly asks to delete or remove it.",
    inputSchema: z.object({ id: z.string() }),
    run: async ({ id }) => {
      const removed = await updateBoard((board) => {
        const i = board.tasks.findIndex((t) => t.id === id);
        return i === -1 ? undefined : board.tasks.splice(i, 1)[0];
      });
      if (!removed) throw new Error(`No task with id ${id}`);
      return `Deleted: ${removed.title}`;
    },
  }),

  betaZodTool({
    name: "add_team_member",
    description: "Add a person to the team roster so tasks can be assigned to them.",
    inputSchema: z.object({
      name: z.string(),
      role: z.string(),
      email: z.string().optional(),
      notes: z.string().optional().describe("Strengths, availability, preferences"),
    }),
    run: async (input) => {
      await updateBoard((board) => {
        board.team.push({ id: newId(), ...input });
      });
      return `Added ${input.name} (${input.role}) to the team.`;
    },
  }),

  betaZodTool({
    name: "list_team",
    description: "List team members with each person's open workload.",
    inputSchema: z.object({}),
    run: async () => {
      const { team, tasks } = await readBoard();
      if (team.length === 0) return "No team members yet.";
      return team
        .map((m) => {
          const open = tasks.filter(
            (t) => t.status !== "done" && t.owner?.toLowerCase() === m.name.toLowerCase(),
          ).length;
          return `${m.name} — ${m.role}${m.email ? ` <${m.email}>` : ""} | ${open} open task(s)${m.notes ? ` | ${m.notes}` : ""}`;
        })
        .join("\n");
    },
  }),

  betaZodTool({
    name: "remember",
    description:
      "Save a durable fact about the user, the business, goals, or preferences so you can use it in future conversations.",
    inputSchema: z.object({ fact: z.string() }),
    run: async ({ fact }) => {
      await updateBoard((board) => {
        board.memories.push({ id: newId(), fact, createdAt: now() });
      });
      return "Saved to memory.";
    },
  }),

  betaZodTool({
    name: "forget",
    description: "Remove a saved memory by id when it is wrong or out of date.",
    inputSchema: z.object({ id: z.string() }),
    run: async ({ id }) => {
      const ok = await updateBoard((board) => {
        const before = board.memories.length;
        board.memories = board.memories.filter((m) => m.id !== id);
        return board.memories.length < before;
      });
      if (!ok) throw new Error(`No memory with id ${id}`);
      return "Forgotten.";
    },
  }),
];

// Stream tool inputs as they're generated rather than in one burst at the end.
export const maxTools = tools.map((t) => ({ ...t, eager_input_streaming: true as const }));
