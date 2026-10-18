"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Board, TaskStatus } from "@/lib/max/store";

type Item =
  | { kind: "user"; text: string }
  | { kind: "max"; text: string }
  | { kind: "tool"; name: string }
  | { kind: "error"; text: string };

const TOOL_LABELS: Record<string, string> = {
  create_task: "Creating a task",
  list_tasks: "Checking the board",
  update_task: "Updating a task",
  delete_task: "Deleting a task",
  add_team_member: "Adding a team member",
  list_team: "Reviewing the team",
  remember: "Saving to memory",
  forget: "Updating memory",
};

const SUGGESTIONS = [
  "Give me today's briefing",
  "Add Sarah to the team as our marketing lead",
  "What's overdue or blocked?",
  "Help me plan this week's priorities",
];

const STATUS_ORDER: TaskStatus[] = ["in_progress", "blocked", "todo"];
const STATUS_LABEL: Record<TaskStatus, string> = {
  in_progress: "In progress",
  blocked: "Blocked",
  todo: "To do",
  done: "Done",
};

function newConversationId() {
  return crypto.randomUUID();
}

export default function Home() {
  const [conversationId, setConversationId] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState<Board | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const refreshBoard = useCallback(async () => {
    const res = await fetch("/api/board");
    if (res.ok) setBoard(await res.json());
  }, []);

  useEffect(() => {
    setConversationId(newConversationId());
    refreshBoard();
  }, [refreshBoard]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [items]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setBusy(true);
    setItems((prev) => [...prev, { kind: "user", text }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          setItems((prev) => {
            const last = prev[prev.length - 1];
            switch (event.type) {
              case "text":
                if (last?.kind === "max") {
                  return [...prev.slice(0, -1), { kind: "max", text: last.text + event.text }];
                }
                return [...prev, { kind: "max", text: event.text }];
              case "tool":
                return [...prev, { kind: "tool", name: event.name }];
              case "error":
                return [...prev, { kind: "error", text: event.message }];
              default:
                return prev;
            }
          });
          if (event.type === "tool" || event.type === "done") refreshBoard();
        }
      }
    } catch (err) {
      setItems((prev) => [...prev, { kind: "error", text: (err as Error).message }]);
    } finally {
      setBusy(false);
      refreshBoard();
    }
  }

  const openTasks = board?.tasks.filter((t) => t.status !== "done") ?? [];

  return (
    <div className="app">
      <main className="chat">
        <header>
          <div className="avatar">M</div>
          <div>
            <h1>Max</h1>
            <p>{busy ? "Working…" : "Your AI manager"}</p>
          </div>
          <button
            onClick={() => {
              setItems([]);
              setConversationId(newConversationId());
            }}
            disabled={busy}
          >
            New chat
          </button>
        </header>

        <div className="messages">
          {items.length === 0 && (
            <div className="empty">
              <p>
                Hi, I&apos;m Max. I keep track of your team&apos;s work, set priorities, and follow up so
                nothing slips. What&apos;s on your plate?
              </p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {items.map((item, i) => {
            switch (item.kind) {
              case "user":
                return <div key={i} className="msg user">{item.text}</div>;
              case "max":
                return <div key={i} className="msg max">{item.text}</div>;
              case "tool":
                return <div key={i} className="tool">↳ {TOOL_LABELS[item.name] ?? item.name}…</div>;
              case "error":
                return <div key={i} className="error">⚠ {item.text}</div>;
            }
          })}
          <div ref={bottom} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            value={input}
            placeholder="Message Max…"
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button className="primary" type="submit" disabled={busy || !input.trim()}>
            Send
          </button>
        </form>
      </main>

      <aside>
        {STATUS_ORDER.map((status) => {
          const tasks = openTasks.filter((t) => t.status === status);
          return (
            <section key={status}>
              <h2>
                {STATUS_LABEL[status]} ({tasks.length})
              </h2>
              {tasks.length === 0 && <p className="none">Nothing here.</p>}
              {tasks.map((t) => (
                <div key={t.id} className="card">
                  <div>{t.title}</div>
                  <div className="meta">
                    <span className={`pill ${t.priority}`}>{t.priority}</span>
                    {[t.owner, t.due && `due ${t.due}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
        <h2>Team ({board?.team.length ?? 0})</h2>
        {board?.team.length ? (
          board.team.map((m) => (
            <div key={m.id} className="card">
              <div>{m.name}</div>
              <div className="meta">{m.role}</div>
            </div>
          ))
        ) : (
          <p className="none">Tell Max who&apos;s on your team.</p>
        )}
      </aside>
    </div>
  );
}
