import { type UIMessage, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { createRequestLogger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limiter";
import { runInputGuardrails } from "@/guardrails/input-sanitizer";
import { getOrCreateSession, updateSession, trackSession } from "@/lib/session";
import { orchestrate } from "@/agents/orchestrator";

/** Extract plain text from a UIMessage's parts array. */
function getTextFromParts(parts: UIMessage["parts"]): string {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/**
 * Return a message as a proper UI message stream so useChat renders it
 * as an assistant message instead of silently swallowing it.
 */
function streamTextMessage(text: string): Response {
  const id = crypto.randomUUID();
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", delta: text, id });
        writer.write({ type: "text-end", id });
      },
    }),
  });
}

export async function POST(request: Request) {
  const traceId =
    request.headers.get("x-trace-id") ?? crypto.randomUUID();
  const sessionId =
    request.headers.get("x-session-id") ?? crypto.randomUUID();
  const userId =
    request.headers.get("x-user-id") ?? "anonymous";
  const log = createRequestLogger(traceId, sessionId);

  try {
    // 1. Rate limit
    const rateLimit = await checkRateLimit(sessionId);
    if (!rateLimit.allowed) {
      log.warn("Rate limit exceeded");
      return streamTextMessage(
        `You're sending messages too quickly. Please wait ${rateLimit.resetIn} seconds before trying again.`
      );
    }

    // 2. Parse body
    const { messages } = (await request.json()) as { messages: UIMessage[] };
    const lastUserMessage = messages.filter((m) => m.role === "user").at(-1);

    if (!lastUserMessage) {
      return streamTextMessage("I didn't receive a message. Could you try again?");
    }

    const lastUserText = getTextFromParts(lastUserMessage.parts);

    // 3. Input guardrails
    const guardrail = runInputGuardrails(lastUserText, log);
    if (guardrail.blocked) {
      log.info({ reason: guardrail.reason }, "Message blocked by guardrails");
      return streamTextMessage(guardrail.reason ?? "I can't process that message. Please try rephrasing.");
    }

    // 4. Session
    const session = await getOrCreateSession(sessionId);
    void trackSession(userId, sessionId);
    log.info({ leadScore: session.leadScore }, "Session loaded");

    // 5. Orchestrate — detects intent and delegates to the right agent.
    //    Pass an onFinish callback so session is updated AFTER the stream
    //    completes, without racing with toUIMessageStreamResponse().
    const result = await orchestrate(messages, {
      onFinish: async (text: string) => {
        try {
          await updateSession(sessionId, {
            messages: [
              ...session.messages,
              { role: "user", content: guardrail.cleanMessage, timestamp: Date.now() },
              { role: "assistant", content: text, timestamp: Date.now() },
            ],
          });
        } catch (err) {
          log.error({ err }, "Failed to update session after response");
        }
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    log.error({ err }, "Chat API error");
    return streamTextMessage(
      "Sorry, something went wrong on my end. Please try again in a moment."
    );
  }
}
