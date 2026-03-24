import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { getLLM } from "@/lib/llm";
import { createRequestLogger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limiter";
import { runInputGuardrails } from "@/guardrails/input-sanitizer";
import { getOrCreateSession, updateSession, trackSession } from "@/lib/session";
import { getSystemPrompt } from "@/agents/orchestrator";

/** Extract plain text from a UIMessage's parts array. */
function getTextFromParts(parts: UIMessage["parts"]): string {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
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
      return new Response(
        JSON.stringify({
          error: "Too many requests. Please wait before sending another message.",
          resetIn: rateLimit.resetIn,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Parse body — AI SDK v6 sends UIMessage[] with `parts` instead of `content`
    const { messages } = (await request.json()) as { messages: UIMessage[] };
    const lastUserMessage = messages.filter((m) => m.role === "user").at(-1);

    if (!lastUserMessage) {
      return new Response(
        JSON.stringify({ error: "No user message found." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const lastUserText = getTextFromParts(lastUserMessage.parts);

    // 3. Input guardrails
    const guardrail = runInputGuardrails(lastUserText, log);
    if (guardrail.blocked) {
      log.info({ reason: guardrail.reason }, "Message blocked by guardrails");
      return new Response(
        JSON.stringify({ error: guardrail.reason }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 4. Session
    const session = await getOrCreateSession(sessionId);
    void trackSession(userId, sessionId);
    log.info({ leadScore: session.leadScore }, "Session loaded");

    // 5. Convert UI messages to model messages for the LLM
    const modelMessages = await convertToModelMessages(messages);

    // 6. Stream response via Vercel AI SDK
    const result = streamText({
      model: getLLM(),
      system: getSystemPrompt(),
      messages: modelMessages,
    });

    // 7. Fire-and-forget session update
    void (async () => {
      try {
        const text = await result.text;
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
    })();

    return result.toUIMessageStreamResponse();
  } catch (err) {
    log.error({ err }, "Chat API error");
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
