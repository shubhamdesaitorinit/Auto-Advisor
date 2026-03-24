import { ORCHESTRATOR_SYSTEM_PROMPT } from "@/prompts/orchestrator";

/**
 * Orchestrator agent — placeholder for Step 1.
 * Currently just returns the system prompt. In later steps this will
 * coordinate between specialised sub-agents (search, negotiation, booking).
 */
export function getSystemPrompt(): string {
  return ORCHESTRATOR_SYSTEM_PROMPT;
}
