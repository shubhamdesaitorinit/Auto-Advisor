import type { VehiclePricing, BuyerProfile, ConstraintResult } from "@/types";

/**
 * Deterministic constraint solver. No LLM involved.
 * Computes the feasible offer space for a vehicle given pricing data and buyer profile.
 */
export function solveConstraints(
  pricing: VehiclePricing,
  buyerProfile: BuyerProfile,
): ConstraintResult {
  // 1. Hard boundaries
  const minSellPrice = pricing.dealerCost * (1 + pricing.marginFloorPct);
  const maxDiscount = pricing.msrp - minSellPrice;
  const maxDiscountPct = maxDiscount / pricing.msrp;

  // 2. Inventory pressure — older stock gets more aggressive offers
  const inventoryPressure: "low" | "medium" | "high" =
    pricing.inventoryAgeDays > 90
      ? "high"
      : pricing.inventoryAgeDays > 60
        ? "medium"
        : "low";

  // 3. Competitive pressure — how much cheaper is the competitor?
  const competitivePressure =
    pricing.competitorPrice !== null
      ? Math.max(0, pricing.msrp - pricing.competitorPrice)
      : 0;

  // 4. Budget gap — how far is MSRP from what the buyer can pay?
  const budgetGap =
    buyerProfile.budgetMax !== undefined
      ? Math.max(0, pricing.msrp - buyerProfile.budgetMax)
      : 0;

  // 5. Can we meet the buyer's budget at all?
  const canMeetBudget =
    buyerProfile.budgetMax !== undefined
      ? minSellPrice <= buyerProfile.budgetMax
      : true;

  return {
    msrp: pricing.msrp,
    minSellPrice,
    maxDiscount,
    maxDiscountPct,
    inventoryPressure,
    competitivePressure,
    budgetGap,
    canMeetBudget,
    destinationFee: pricing.destinationFee,
  };
}
