import {
  type UIMessage,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { createRequestLogger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limiter";
import { runInputGuardrails } from "@/guardrails/input-sanitizer";
import { runOutputValidation } from "@/guardrails/output-validator";
import { getOrCreateSession, updateSession, trackSession } from "@/lib/session";
import { orchestrate } from "@/agents/orchestrator";
import type { BuyerProfile } from "@/types";

/** Extract plain text from a UIMessage's parts array. */
function getTextFromParts(parts: UIMessage["parts"]): string {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Return a text message as a proper UI message stream. */
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
        `You're sending messages too quickly. Please wait ${rateLimit.resetIn} seconds before trying again.`,
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
      return streamTextMessage(
        guardrail.reason ?? "I can't process that message. Please try rephrasing.",
      );
    }

    // 4. Session
    const session = await getOrCreateSession(sessionId);
    void trackSession(userId, sessionId);
    log.info({ leadScore: session.leadScore }, "Session loaded");

    // Track state updates from agents
    let updatedProfile: BuyerProfile | undefined;
    let newVehicleIds: string[] = [];
    let newOffers = new Map<string, import("@/types").Offer>();

    // 5. Orchestrate
    const result = await orchestrate(messages, {
      sessionId,
      buyerProfile: session.buyerProfile,
      log,
      onProfileUpdate: (profile) => {
        updatedProfile = profile;
      },
      onVehiclesViewed: (ids) => {
        newVehicleIds = ids;
      },
      onOffersGenerated: (offers) => {
        newOffers = offers;
      },
    });

    // 6. Collect full response text, validate, then stream the validated version.
    //    This ensures the user NEVER sees an invalid response.
    const fullText = await result.text;

    // 7. Output validation (runs BEFORE user sees the response)
    const allOffers = { ...session.activeOffers };
    for (const [vid, offer] of newOffers) {
      allOffers[vid] = offer;
    }

    const validation = await runOutputValidation(fullText, {
      activeOffers: allOffers,
      log,
    });

    const finalText = validation.correctedResponse;

    if (validation.blocked) {
      log.warn(
        { blockReason: validation.blockReason, processingTimeMs: validation.processingTimeMs },
        "Output BLOCKED by validation",
      );
    }

    // 8. Session update (fire-and-forget — don't block the response)
    void (async () => {
      try {
        const sessionUpdate: Record<string, unknown> = {
          messages: [
            ...session.messages,
            { role: "user", content: guardrail.cleanMessage, timestamp: Date.now() },
            { role: "assistant", content: finalText, timestamp: Date.now() },
          ],
        };

        if (newVehicleIds.length > 0) {
          sessionUpdate.vehiclesViewed = [
            ...new Set([...session.vehiclesViewed, ...newVehicleIds]),
          ];
        }

        if (newOffers.size > 0) {
          sessionUpdate.activeOffers = allOffers;
        }

        if (updatedProfile) {
          sessionUpdate.buyerProfile = updatedProfile;
          if (session.leadScore === "cold") {
            sessionUpdate.leadScore = "warm";
          }
          if (updatedProfile.negotiationIntent || updatedProfile.budgetMax) {
            sessionUpdate.leadScore = "hot";
          }
        }

        await updateSession(sessionId, sessionUpdate);
      } catch (err) {
        log.error({ err }, "Failed to update session");
      }
    })();

    // 9. Stream the validated text to the user
    return streamTextMessage(finalText);
  } catch (err) {
    log.error({ err }, "Chat API error");
    return streamTextMessage(
      "Sorry, something went wrong on my end. Please try again in a moment.",
    );
  }
}
