import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { getLLM } from "@/lib/llm";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "@/prompts/orchestrator";
import { runVehicleSearchAgent } from "./vehicle-search";

/** Keywords that signal a vehicle search / vehicle-related query. */
const VEHICLE_INTENT_PATTERNS = [
  // Body types
  /\b(suv|sedan|truck|hatchback|crossover|pickup|minivan|coupe|convertible)\b/i,
  // Actions
  /\b(show me|looking for|find|search|recommend|suggest|compare|which car|what car|best car|need a car|need a vehicle|buy|purchase)\b/i,
  // Specs & features
  /\b(awd|4wd|fwd|hybrid|electric|ev|phev|fuel economy|fuel efficient|mileage|horsepower|tow|towing|cargo|seating|7.seat|8.seat|winter ready)\b/i,
  // Budget
  /\b(under \$|budget|affordable|cheap|price|pricing|msrp|cost|cad|\$\d)/i,
  // Brands
  /\b(toyota|honda|hyundai|kia|ford|mazda|subaru|chevrolet|chevy|ram|tesla|bmw|audi|mercedes|volkswagen|nissan|gmc|jeep)\b/i,
  // Models
  /\b(rav4|cr-v|crv|tucson|sportage|cx-50|forester|escape|highlander|palisade|telluride|f-150|f150|tacoma|1500|civic|camry|sonata|model y|ioniq|equinox)\b/i,
  // Canadian-specific
  /\b(izev|rebate|winter|snow|heated seats|remote start|block heater|all.weather|l\/100km)\b/i,
  // Comparisons
  /\b(vs|versus|compare|comparison|better|which one|difference between)\b/i,
  // Test drive / booking
  /\b(test drive|book|appointment|visit|dealership)\b/i,
  // Vehicle details
  /\b(details|specs|specifications|features|colors|safety|rating|warranty)\b/i,
];

/** Check if a message is vehicle-search related. */
function isVehicleIntent(message: string): boolean {
  return VEHICLE_INTENT_PATTERNS.some((pattern) => pattern.test(message));
}

/** Get the latest user message text from UIMessages. */
function getLatestUserText(messages: UIMessage[]): string {
  const last = messages.filter((m) => m.role === "user").at(-1);
  if (!last) return "";
  return last.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export interface OrchestrateOptions {
  onFinish?: (text: string) => Promise<void>;
}

/**
 * Orchestrate the response: detect intent and delegate to the right agent.
 * Returns a streaming result.
 */
export async function orchestrate(messages: UIMessage[], options?: OrchestrateOptions) {
  const latestText = getLatestUserText(messages);
  const modelMessages = await convertToModelMessages(messages);

  const onFinishCallback = options?.onFinish
    ? ({ text }: { text: string }) => { void options.onFinish!(text); }
    : undefined;

  // Delegate to vehicle search agent for vehicle-related queries
  if (isVehicleIntent(latestText)) {
    return runVehicleSearchAgent(modelMessages, onFinishCallback);
  }

  // General assistant response
  return streamText({
    model: getLLM(),
    system: ORCHESTRATOR_SYSTEM_PROMPT,
    messages: modelMessages,
    onFinish: onFinishCallback,
  });
}
