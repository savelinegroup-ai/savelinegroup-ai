import Anthropic from "@anthropic-ai/sdk";
import { buildContext, MAX_SYSTEM_PROMPT } from "./prompt";
import { loadConversation, readBoard, saveConversation } from "./store";
import { maxTools } from "./tools";

const client = new Anthropic();

export type MaxEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "error"; message: string }
  | { type: "done" };

class TruncatedToolInput extends Error {}

/** Run one user turn through Max, yielding events for the UI as they happen. */
export async function* runMax(conversationId: string, userText: string): AsyncGenerator<MaxEvent> {
  const history = await loadConversation(conversationId);
  const board = await readBoard();

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    { role: "user", content: userText },
    // Mid-conversation system message: fresh date + memories each turn without
    // touching the cached system prompt or earlier history.
    { role: "system", content: buildContext(board) },
  ];

  let runner = client.beta.messages.toolRunner({
    model: "claude-opus-5-5",
    max_tokens: 64000,
    system: [{ type: "text", text: MAX_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium" },
    // If a safety classifier declines, re-run on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    tools: maxTools,
    messages,
    max_iterations: 20,
    stream: true,
  });

  for (let attempt = 0; ; attempt++) {
    try {
      for await (const stream of runner) {
        for await (const event of stream) {
          if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
            yield { type: "tool", name: event.content_block.name };
          } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            yield { type: "text", text: event.delta.text };
          }
        }
        const message = await stream.finalMessage();
        attempt = 0;
        const hasToolUse = message.content.some((b) => b.type === "tool_use");
        if (message.stop_reason === "max_tokens" && hasToolUse) {
          throw new TruncatedToolInput("Max's reply was cut off mid-action. Please try again.");
        }
        if (message.stop_reason === "refusal") {
          yield { type: "text", text: "\n\nI can't help with that one." };
          break;
        }
      }
      break;
    } catch (err) {
      // Re-issue only when a streamed tool input wasn't parseable JSON.
      if (err instanceof Anthropic.APIError || err instanceof TruncatedToolInput || attempt >= 2) {
        yield { type: "error", message: err instanceof Error ? err.message : String(err) };
        return;
      }
      runner = client.beta.messages.toolRunner({ ...runner.params });
    }
  }

  // runner.params.messages holds the full turn, including the final reply.
  await saveConversation(conversationId, runner.params.messages);
  yield { type: "done" };
}
