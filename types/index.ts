// ── Session & Profile ────────────────────────────────────────────

export interface BuyerSignal {
  type: "explicit" | "soft" | "behavioral";
  signal: string;
  value: unknown;
  turn: number;
  timestamp: number;
}

export interface BuyerProfile {
  budgetMax?: number;
  budgetMin?: number;
  includesFees?: boolean;
  preferredBodyType?: string;
  preferredFuelType?: string;
  preferredDrivetrain?: string;
  features?: string[];
  seatingMin?: number;
  priceResistance: boolean;
  negotiationIntent: boolean;
  financeInterest: boolean;
  rateSensitive: boolean;
  competitorAnchor?: number;
  competitorVehicle?: string;
  urgency: "low" | "medium" | "high";
  dealSeeking: boolean;
  hasTradeIn: boolean;
  tradeInVehicle?: string;
  signals: BuyerSignal[];
}

export const DEFAULT_BUYER_PROFILE: BuyerProfile = {
  priceResistance: false,
  negotiationIntent: false,
  financeInterest: false,
  rateSensitive: false,
  urgency: "medium",
  dealSeeking: false,
  hasTradeIn: false,
  signals: [],
};

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface Session {
  id: string;
  createdAt: number;
  lastActiveAt: number;
  messages: SessionMessage[];
  buyerProfile: BuyerProfile;
  vehiclesViewed: string[];
  /** Active offers keyed by vehicleId. Supports negotiating multiple vehicles. */
  activeOffers: Record<string, Offer>;
  leadScore: "cold" | "warm" | "hot";
}

// ── Offers & Negotiation ─────────────────────────────────────────

export interface OfferExtra {
  type:
    | "cashback"
    | "extended_warranty"
    | "accessories"
    | "winter_tires"
    | "free_service"
    | "promotional_financing";
  dealerCost: number;
  perceivedValue: number;
  rate?: number;
  description?: string;
}

export interface Offer {
  id?: string;
  vehicleId: string;
  msrp: number;
  offeredPrice: number;
  discountAmount: number;
  discountPct: number;
  destinationFee: number;
  totalOTDEstimate: number;
  extras: OfferExtra[];
  totalPerceivedSavings: number;
  marginRetainedPct: number;
  approvalStatus: "auto_approved" | "needs_manager" | "rejected";
  validForHours: number;
  justification: string;
  createdAt?: number;
}

export interface EMIResult {
  emi: number;
  totalPayment: number;
  totalInterest: number;
  principal: number;
  annualRate: number;
  tenureMonths: number;
}

export interface FinancingOption extends EMIResult {
  tenure: number;
  label: string;
}

// ── Vehicle Pricing (from DB) ────────────────────────────────────

export interface VehiclePricing {
  vehicleId: string;
  msrp: number;
  dealerCost: number;
  marginFloorPct: number;
  competitorPrice: number | null;
  competitorName: string | null;
  inventoryAgeDays: number;
  stockQuantity: number;
  maxDiscountPct: number;
  destinationFee: number;
  accessoriesCost: number;
  accessoriesValue: number;
  warrantyExtCost: number;
  warrantyExtValue: number;
  financingRatePct: number | null;
  cashbackOffer: number | null;
}

export interface ConstraintResult {
  msrp: number;
  minSellPrice: number;
  maxDiscount: number;
  maxDiscountPct: number;
  inventoryPressure: "low" | "medium" | "high";
  competitivePressure: number;
  budgetGap: number;
  canMeetBudget: boolean;
  destinationFee: number;
}

// ── Approval ─────────────────────────────────────────────────────

export interface ApprovalResult {
  approved: boolean;
  status: "auto_approved" | "pending_manager" | "rejected";
  reason: string;
  respondToUser: string;
}

// ── Guardrails ───────────────────────────────────────────────────

export interface GuardrailResult {
  blocked: boolean;
  reason?: string;
  cleanMessage: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number;
}

export interface PIIDetectionResult {
  found: boolean;
  types: string[];
  masked: string;  // All PII masked (for logging)
  clean: string;   // Only sensitive IDs masked, contact info preserved (for conversation)
}

export interface PromptInjectionResult {
  detected: boolean;
  pattern?: string;
}

export interface TopicRelevanceResult {
  relevant: boolean;
  suggestion?: string;
}
