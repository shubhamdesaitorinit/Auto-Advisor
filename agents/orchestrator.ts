import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { getLLM } from "@/lib/llm";
import { logger } from "@/lib/logger";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "@/prompts/orchestrator";
import { runVehicleSearchAgent } from "./vehicle-search";
import { runNegotiationAgent } from "./negotiation";
import type { BuyerProfile } from "@/types";
import { DEFAULT_BUYER_PROFILE } from "@/types";
import type { Logger } from "pino";

// ── Negotiation intent patterns (checked FIRST — more specific) ─────
const NEGOTIATION_INTENT_PATTERNS = [
  /\b(best price|best deal|best offer|what.s the price|how much|price on|cost of)\b/i,
  /\b(discount|deal|offer|negotiate|bargain|lower.the.price|reduce|knock off|come down)\b/i,
  /\b(can you do better|is that.*(best|final)|too (expensive|pricey|much)|out of.*(my |the )?budget|can.t afford|over.*budget)\b/i,
  /\b(my budget|i can.*(spend|afford|pay|go)|not more than|max.*\$|won.t pay more)\b/i,
  /\b(monthly payment|emi|finance|financing|interest rate|down payment|lease|loan|per month)\b/i,
  /\b(promotion|promo|sale|incentive|rebate|cashback|special.*offer)\b/i,
  /\b(friend.*(got|bought|paid)|saw.*(for|at)|competitor|other dealer|match.*price)\b/i,
  /\b(trade.in|trade my|current car|sell my)\b/i,
  /\b(ready to buy|want to buy|let.s do it|i.ll take|sign|close|wrap up)\b/i,
];

// ── Vehicle search intent patterns ──────────────────────────────────
const VEHICLE_INTENT_PATTERNS = [
  /\b(suv|sedan|truck|hatchback|crossover|pickup|minivan|coupe|convertible)\b/i,
  /\b(show me|looking for|find|search|recommend|suggest|compare|which car|what car|best car|need a car|need a vehicle|buy|purchase)\b/i,
  /\b(awd|4wd|fwd|hybrid|electric|ev|phev|fuel economy|fuel efficient|mileage|horsepower|tow|towing|cargo|seating|7.seat|8.seat|winter ready)\b/i,
  /\b(under \$|budget|affordable|cheap|price|pricing|msrp|cost|cad|\$\d)/i,
  /\b(toyota|honda|hyundai|kia|ford|mazda|subaru|chevrolet|chevy|ram|tesla|bmw|audi|mercedes|volkswagen|nissan|gmc|jeep)\b/i,
  /\b(rav4|cr-v|crv|tucson|sportage|cx-50|forester|escape|highlander|palisade|telluride|f-150|f150|tacoma|1500|civic|camry|sonata|model y|ioniq|equinox)\b/i,
  /\b(izev|rebate|winter|snow|heated seats|remote start|block heater|all.weather|l\/100km)\b/i,
  /\b(vs|versus|compare|comparison|better|which one|difference between)\b/i,
  /\b(test drive|book|appointment|visit|dealership)\b/i,
  /\b(details|specs|specifications|features|colors|safety|rating|warranty)\b/i,
];

function isNegotiationIntent(message: string): boolean {
  return NEGOTIATION_INTENT_PATTERNS.some((p) => p.test(message));
}

function isVehicleIntent(message: string): boolean {
  return VEHICLE_INTENT_PATTERNS.some((p) => p.test(message));
}

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
  sessionId?: string;
  buyerProfile?: BuyerProfile;
  onProfileUpdate?: (profile: BuyerProfile) => void;
  log?: Logger;
}

export async function orchestrate(
  messages: UIMessage[],
  options?: OrchestrateOptions,
) {
  const latestText = getLatestUserText(messages);
  const modelMessages = await convertToModelMessages(messages);
  const log = options?.log ?? logger;

  const onFinishCallback = options?.onFinish
    ? ({ text }: { text: string }) => {
        void options.onFinish!(text);
      }
    : undefined;

  // 1. Negotiation intent
  if (isNegotiationIntent(latestText)) {
    log.info(
      { agent: "negotiation", message: latestText.slice(0, 100) },
      "Routing to negotiation agent",
    );

    const profile = options?.buyerProfile ?? DEFAULT_BUYER_PROFILE;
    const sessionId = options?.sessionId ?? "unknown";

    const { stream, getUpdatedProfile } = runNegotiationAgent(
      modelMessages,
      sessionId,
      profile,
      log,
      (event) => {
        options?.onProfileUpdate?.(getUpdatedProfile());
        onFinishCallback?.(event);
      },
    );
    return stream;
  }

  // 2. Vehicle search intent
  if (isVehicleIntent(latestText)) {
    log.info(
      { agent: "vehicle-search", message: latestText.slice(0, 100) },
      "Routing to vehicle search agent",
    );
    return runVehicleSearchAgent(modelMessages, onFinishCallback);
  }

  // 3. General assistant
  log.info(
    { agent: "general", message: latestText.slice(0, 100) },
    "Routing to general assistant",
  );
  return streamText({
    model: getLLM(),
    system: ORCHESTRATOR_SYSTEM_PROMPT,
    messages: modelMessages,
    onFinish: onFinishCallback,
  });
}
