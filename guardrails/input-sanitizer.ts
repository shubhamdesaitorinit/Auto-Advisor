import { detectPromptInjection } from "./prompt-injection";
import { detectPII } from "./pii-detector";
import { checkTopicRelevance } from "./topic-guard";
import type { GuardrailResult } from "@/types";
import type { Logger } from "pino";

export function runInputGuardrails(
  message: string,
  log?: Logger,
): GuardrailResult {
  // 0. Message length limit — prevent token abuse
  const MAX_MESSAGE_LENGTH = 2000;
  if (message.length > MAX_MESSAGE_LENGTH) {
    log?.warn({ check: "length", length: message.length }, "Message too long");
    return {
      blocked: true,
      reason: "Your message is too long. Please keep it under 2,000 characters.",
      cleanMessage: message.slice(0, MAX_MESSAGE_LENGTH),
    };
  }

  // 1. Prompt injection check
  const injection = detectPromptInjection(message);
  log?.info({ check: "prompt_injection", result: injection.detected ? "blocked" : "pass" });
  if (injection.detected) {
    return {
      blocked: true,
      reason: "I'm here to help you find the perfect vehicle! Please ask me about cars, pricing, or test drives.",
      cleanMessage: message,
    };
  }

  // 2. PII detection — mask sensitive IDs but preserve contact info
  const pii = detectPII(message);
  log?.info({ check: "pii_detection", found: pii.found, types: pii.types });
  // Use `clean` (keeps email/phone) not `masked` (redacts everything)
  const cleanMessage = pii.found ? pii.clean : message;

  // 3. Topic relevance check
  const topic = checkTopicRelevance(cleanMessage);
  log?.info({ check: "topic_relevance", result: topic.relevant ? "pass" : "blocked" });
  if (!topic.relevant) {
    return {
      blocked: true,
      reason: topic.suggestion,
      cleanMessage,
    };
  }

  return { blocked: false, cleanMessage };
}
