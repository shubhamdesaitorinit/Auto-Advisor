import { convertToModelMessages, type UIMessage } from "ai";
import { getLLM, streamTextWithRetry } from "@/lib/llm";
import { logger } from "@/lib/logger";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "@/prompts/orchestrator";
import { runVehicleSearchAgent } from "./vehicle-search";
import { runNegotiationAgent } from "./negotiation";
import { runBookingAgent } from "./booking";
import { runLeadCaptureAgent } from "./lead-capture";
import type { BuyerProfile, Session } from "@/types";
import { DEFAULT_BUYER_PROFILE } from "@/types";
import type { Logger } from "pino";

// ── Booking intent patterns (checked FIRST — most specific) ─────
const BOOKING_INTENT_PATTERNS = [
  /\b(?:book|schedule|arrange)\s*(?:a\s*)?(?:test\s*drive|drive|appointment|visit)/i,
  /\b(?:test\s*drive|take\s*(?:it|one)\s*for\s*a\s*(?:spin|drive))/i,
  /\b(?:when\s*can\s*I\s*come\s*in|available\s*(?:times?|slots?|this))/i,
  /\b(?:cancel|reschedule)\s*(?:my\s*)?(?:test\s*drive|appointment|booking)/i,
  /\b(?:what\s*times?\s*(?:are|do)\s*you\s*have)/i,
];

// ── Lead capture intent patterns ────────────────────────────────
const LEAD_CAPTURE_PATTERNS = [
  /\b(?:email|send)\s*(?:me|it)\s*(?:the\s*)?(?:details|info|summary|specs)/i,
  /\b(?:can\s*you\s*)?(?:email|send)\s*(?:me|that)\b/i,
  /\b(?:follow\s*up|contact\s*me|call\s*me|reach\s*(?:me|out))/i,
  /\bmy\s*email\s*is\b/i,
  /[\w.-]+@[\w.-]+\.\w{2,}/i, // raw email in message
];

// ── Negotiation intent patterns ─────────────────────────────────
const NEGOTIATION_INTENT_PATTERNS = [
  /\b(best price|best deal|best offer|what.s the price|how much|price on|cost of)\b/i,
  /\b(discount|deal|offer|negotiate|bargain|lower.the.price|reduce|knock off|come down)\b/i,
  /\b(can you do better|is that.*(best|final)|too (expensive|pricey|much)|out of.*(my |the )?budget|can.t afford|over.*budget)\b/i,
  /\b(my budget|i can.*(spend|afford|pay|go)|not more than|max.*\$|won.t pay more)\b/i,
  /\b(monthly payment|emi|finance|financing|interest rate|down payment|lease|loan|per month)\b/i,
  /\b(promotion|promo|sale|incentive|rebate|cashback|special.*offer)\b/i,
  /\b(friend.*(got|bought|paid)|saw.*(for|at)|competitor|other dealer|match.*price)\b/i,
  /\b(trade.in|trade my|current car|sell my)\b/i,
  /\b(ready to buy|want to buy|let.s do it|i.ll take|i will take|i.?ll take|go ahead|go with|wrap up)\b/i,
];

// ── Vehicle search intent patterns ──────────────────────────────
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

function isBookingIntent(msg: string): boolean {
  return BOOKING_INTENT_PATTERNS.some((p) => p.test(msg));
}

function isLeadCaptureIntent(msg: string): boolean {
  return LEAD_CAPTURE_PATTERNS.some((p) => p.test(msg));
}

function isNegotiationIntent(msg: string): boolean {
  return NEGOTIATION_INTENT_PATTERNS.some((p) => p.test(msg));
}

function isVehicleIntent(msg: string): boolean {
  return VEHICLE_INTENT_PATTERNS.some((p) => p.test(msg));
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
  session?: Session;
  buyerProfile?: BuyerProfile;
  onProfileUpdate?: (profile: BuyerProfile) => void;
  onVehiclesViewed?: (vehicleIds: string[]) => void;
  onOffersGenerated?: (offers: Map<string, import("@/types").Offer>) => void;
  log?: Logger;
}

/**
 * Orchestrate: detect intent and delegate to the right agent.
 * Priority: booking → lead capture → negotiation → vehicle search → general
 */
export async function orchestrate(
  messages: UIMessage[],
  options?: OrchestrateOptions,
) {
  const latestText = getLatestUserText(messages);
  const modelMessages = await convertToModelMessages(messages);
  const log = options?.log ?? logger;
  const sessionId = options?.sessionId ?? "unknown";

  const onFinishCallback = options?.onFinish
    ? ({ text }: { text: string }) => {
        void options.onFinish!(text);
      }
    : undefined;

  // 1. Booking intent — unless user is also asking to SEARCH for vehicles
  //    "Book a test drive for the Tucson" → booking (vehicle named, go book)
  //    "Show me SUVs and book a test drive" → vehicle search first (need to pick first)
  const hasSearchAction = /\b(show me|looking for|find|search|recommend|compare)\b/i.test(latestText);
  if (isBookingIntent(latestText) && !hasSearchAction) {
    log.info({ agent: "booking", message: latestText.slice(0, 100) }, "Routing to booking agent");
    return runBookingAgent(modelMessages, sessionId, log, onFinishCallback);
  }

  // 2. Lead capture intent — "email me details", contact info shared
  if (isLeadCaptureIntent(latestText) && options?.session) {
    log.info({ agent: "lead-capture", message: latestText.slice(0, 100) }, "Routing to lead capture agent");
    return runLeadCaptureAgent(modelMessages, options.session, log, onFinishCallback);
  }

  // 3. Negotiation intent
  if (isNegotiationIntent(latestText)) {
    log.info({ agent: "negotiation", message: latestText.slice(0, 100) }, "Routing to negotiation agent");

    const profile = options?.buyerProfile ?? DEFAULT_BUYER_PROFILE;

    const sessionCtx = options?.session
      ? { vehiclesViewed: options.session.vehiclesViewed, activeOffers: options.session.activeOffers }
      : undefined;

    const { stream, getUpdatedProfile, getViewedVehicleIds, getGeneratedOffers } = runNegotiationAgent(
      modelMessages,
      sessionId,
      profile,
      log,
      (event) => {
        options?.onProfileUpdate?.(getUpdatedProfile());
        const viewed = getViewedVehicleIds();
        if (viewed.length > 0) options?.onVehiclesViewed?.(viewed);
        const offers = getGeneratedOffers();
        if (offers.size > 0) options?.onOffersGenerated?.(offers);
        onFinishCallback?.(event);
      },
      sessionCtx,
    );
    return stream;
  }

  // 4. Vehicle search intent
  if (isVehicleIntent(latestText)) {
    log.info({ agent: "vehicle-search", message: latestText.slice(0, 100) }, "Routing to vehicle search agent");

    const profile = options?.buyerProfile;
    let buyerContext: string | undefined;
    if (profile && (profile.budgetMax || profile.preferredBodyType || profile.financeInterest)) {
      const parts: string[] = [];
      if (profile.budgetMax) parts.push(`Budget: up to $${profile.budgetMax.toLocaleString("en-CA")}`);
      if (profile.budgetMin) parts.push(`Min budget: $${profile.budgetMin.toLocaleString("en-CA")}`);
      if (profile.preferredBodyType) parts.push(`Preferred body type: ${profile.preferredBodyType}`);
      if (profile.preferredFuelType) parts.push(`Preferred fuel: ${profile.preferredFuelType}`);
      if (profile.financeInterest) parts.push("Interested in financing");
      if (profile.urgency !== "medium") parts.push(`Purchase urgency: ${profile.urgency}`);
      buyerContext = parts.join("\n");
    }

    const { stream: searchStream, getViewedIds } = runVehicleSearchAgent(
      modelMessages,
      (event) => {
        const viewed = getViewedIds();
        if (viewed.length > 0) options?.onVehiclesViewed?.(viewed);
        onFinishCallback?.(event);
      },
      buyerContext,
    );
    return searchStream;
  }

  // 5. General assistant
  log.info({ agent: "general", message: latestText.slice(0, 100) }, "Routing to general assistant");
  return streamTextWithRetry({
    model: getLLM(),
    system: ORCHESTRATOR_SYSTEM_PROMPT,
    messages: modelMessages,
    onFinish: onFinishCallback,
  });
}
