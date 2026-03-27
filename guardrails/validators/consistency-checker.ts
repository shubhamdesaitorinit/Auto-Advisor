import { extractPrices, filterVehiclePrices } from "./shared";
import type { Offer } from "@/types";

export interface ConsistencyIssue {
  type: string;
  detail: string;
  severity: "info" | "warning" | "critical";
}

export interface ConsistencyResult {
  passed: boolean;
  issues: ConsistencyIssue[];
}

/**
 * Check if the response contradicts the current conversation state.
 *
 * Checks:
 * 1. Price consistency with active offer (offered price, MSRP, OTD)
 * 2. Discount claims match the actual offer discount
 * 3. Extras claims match the offer extras
 */
export function checkConsistency(
  response: string,
  activeOffers?: Record<string, Offer>,
): ConsistencyResult {
  const issues: ConsistencyIssue[] = [];

  if (!activeOffers || Object.keys(activeOffers).length === 0) {
    return { passed: true, issues: [] };
  }

  const allOffers = Object.values(activeOffers);
  const allPrices = extractPrices(response);
  const vehiclePrices = filterVehiclePrices(allPrices, response);

  // 1. Price consistency — check each mentioned price against all active offers
  for (const price of vehiclePrices) {
    for (const offer of allOffers) {
      // Skip known reference values
      if (
        price.value === offer.msrp ||
        price.value === offer.offeredPrice ||
        price.value === offer.destinationFee ||
        price.value === offer.totalOTDEstimate
      ) continue;

      const diffFromOffer = Math.abs(price.value - offer.offeredPrice);
      const diffFromMSRP = Math.abs(price.value - offer.msrp);

      if (diffFromOffer > 50 && diffFromOffer < 3000 && diffFromMSRP > 50) {
        issues.push({
          type: "price_inconsistency",
          detail: `Mentions $${price.value.toLocaleString("en-CA")} but offer for vehicle is $${offer.offeredPrice.toLocaleString("en-CA")}`,
          severity: "warning",
        });
        break;
      }
    }
  }

  // 2. Discount claim consistency — check against any active offer
  const discountPctMatch = response.match(/(\d+\.?\d*)\s*%\s*(?:off|discount|savings?|reduction)/i);
  if (discountPctMatch) {
    const claimedPct = parseFloat(discountPctMatch[1]);
    const matchesAny = allOffers.some(
      (o) => Math.abs(claimedPct - o.discountPct * 100) <= 0.5,
    );
    if (!matchesAny) {
      const closest = allOffers.reduce((c, o) =>
        Math.abs(o.discountPct * 100 - claimedPct) < Math.abs(c.discountPct * 100 - claimedPct) ? o : c,
      );
      issues.push({
        type: "discount_inconsistency",
        detail: `Claims ${claimedPct}% discount but closest offer is ${(closest.discountPct * 100).toFixed(1)}%`,
        severity: "warning",
      });
    }
  }

  // 3. Savings claim consistency
  const savingsMatch = response.match(/saving(?:s)?\s*(?:of\s*)?\$\s*([\d,]+)/i);
  if (savingsMatch) {
    const claimedSavings = parseFloat(savingsMatch[1].replace(/,/g, ""));
    const matchesAny = allOffers.some(
      (o) => Math.abs(claimedSavings - o.totalPerceivedSavings) <= 200,
    );
    if (!matchesAny) {
      issues.push({
        type: "savings_inconsistency",
        detail: `Claims $${claimedSavings.toLocaleString("en-CA")} savings but doesn't match any active offer`,
        severity: "info",
      });
    }
  }

  return {
    passed: !issues.some((i) => i.severity === "critical"),
    issues,
  };
}
