export interface BuyerProfile {
  budgetMax?: number;
  budgetMin?: number;
  preferredBodyType?: string;
  preferredFuelType?: string;
  preferredDrivetrain?: string;
  features?: string[];
  seatingMin?: number;
  financeInterest?: boolean;
  tradeInVehicle?: string;
  urgency?: "low" | "medium" | "high";
}

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
  currentOffer?: unknown;
  leadScore: "cold" | "warm" | "hot";
}

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
  masked: string;
}

export interface PromptInjectionResult {
  detected: boolean;
  pattern?: string;
}

export interface TopicRelevanceResult {
  relevant: boolean;
  suggestion?: string;
}
