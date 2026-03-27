import type { BuyerProfile, BuyerSignal } from "@/types";

/**
 * Merge new signals into the buyer profile.
 * Latest explicit signals win conflicts (e.g., updated budget).
 * All signals are appended to history for audit.
 */
export function updateBuyerProfile(
  current: BuyerProfile,
  newSignals: BuyerSignal[],
): BuyerProfile {
  const updated = { ...current, signals: [...current.signals, ...newSignals] };

  for (const signal of newSignals) {
    switch (signal.signal) {
      // ── Explicit budget signals ──────────────────────────────
      case "budget_max":
        updated.budgetMax = signal.value as number;
        break;
      case "budget_min":
        updated.budgetMin = signal.value as number;
        break;
      case "includes_fees":
        updated.includesFees = signal.value as boolean;
        break;

      // ── Soft signals ─────────────────────────────────────────
      case "price_resistance":
        updated.priceResistance = true;
        break;
      case "negotiation_intent":
        updated.negotiationIntent = true;
        break;
      case "hesitation":
        // Hesitation is a soft price resistance
        updated.priceResistance = true;
        break;

      // ── Behavioral signals ───────────────────────────────────
      case "finance_interest":
        updated.financeInterest = true;
        break;
      case "rate_sensitive":
        updated.rateSensitive = true;
        updated.financeInterest = true;
        break;
      case "competitor_anchor":
        updated.competitorAnchor = signal.value as number;
        break;
      case "competitor_vehicle":
        updated.competitorVehicle = signal.value as string;
        break;
      case "urgency":
        updated.urgency = signal.value as "low" | "medium" | "high";
        break;
      case "deal_seeking":
        updated.dealSeeking = true;
        break;
      case "has_trade_in":
        updated.hasTradeIn = true;
        break;
      case "trade_in_vehicle":
        updated.hasTradeIn = true;
        updated.tradeInVehicle = signal.value as string;
        break;

      default:
        // Unknown signal — store in history but don't update profile fields
        break;
    }
  }

  return updated;
}
