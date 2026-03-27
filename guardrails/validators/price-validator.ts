import {
  extractPrices,
  filterVehiclePrices,
  isVehicleNearPosition,
  type ResolvedVehicle,
} from "./shared";
import type { Offer } from "@/types";

export interface PriceCheck {
  vehicleName: string;
  mentionedPrice: number;
  msrp: number;
  minAllowedPrice: number;
  withinBounds: boolean;
  severity: "info" | "warning" | "critical";
  context: string;
}

export interface PriceValidationResult {
  passed: boolean;
  checks: PriceCheck[];
}

/**
 * Validate that vehicle prices in the response are within allowed bounds.
 * Uses pre-resolved vehicles from the spec validator to avoid duplicate DB calls.
 *
 * BLOCKS if any price falls below margin floor.
 */
export function validatePrices(
  response: string,
  resolvedVehicles: Map<string, ResolvedVehicle>,
  activeOffers?: Record<string, Offer>,
): PriceValidationResult {
  const checks: PriceCheck[] = [];

  if (resolvedVehicles.size === 0 && !activeOffers) {
    return { passed: true, checks: [] };
  }

  // Step 1: Extract and filter to likely vehicle sticker prices
  const allPrices = extractPrices(response);
  const vehiclePrices = filterVehiclePrices(allPrices, response);

  if (vehiclePrices.length === 0) {
    return { passed: true, checks: [] };
  }

  // Step 2: Match each price to a nearby vehicle mention
  for (const price of vehiclePrices) {
    let matched: ResolvedVehicle | null = null;

    for (const [, vehicle] of resolvedVehicles) {
      if (isVehicleNearPosition(response, price.index, vehicle)) {
        matched = vehicle;
        break;
      }
    }

    if (!matched) continue;

    const msrp = Number(matched.msrp);
    const dealerCost = Number(matched.dealerCost);
    const marginFloor = Number(matched.marginFloorPct);
    const minAllowed = Math.ceil(dealerCost * (1 + marginFloor));
    const vehicleName = `${matched.make} ${matched.model}`;

    // Check if this price is presented as MSRP/starting price
    const priceContext = response.slice(
      Math.max(0, price.index - 40),
      price.index + price.raw.length + 10,
    ).toLowerCase();
    const isMSRPContext = /msrp|starting\s*(?:at|from|price)|starts?\s*at|priced\s*at|retail|list\s*price/i.test(priceContext);

    if (isMSRPContext && price.value !== msrp) {
      // Wrong MSRP — critical, the claimed "starting price" doesn't match DB
      checks.push({
        vehicleName,
        mentionedPrice: price.value,
        msrp,
        minAllowedPrice: msrp,
        withinBounds: false,
        severity: "critical",
        context: `Claims MSRP/starting price $${price.value.toLocaleString("en-CA")} but actual MSRP is $${msrp.toLocaleString("en-CA")}`,
      });
      continue;
    }

    // Correct MSRP reference
    if (price.value === msrp) {
      checks.push({
        vehicleName,
        mentionedPrice: price.value,
        msrp,
        minAllowedPrice: minAllowed,
        withinBounds: true,
        severity: "info",
        context: "MSRP reference",
      });
      continue;
    }

    // Offered/discounted price — must be above margin floor
    const withinBounds = price.value >= minAllowed;

    checks.push({
      vehicleName,
      mentionedPrice: price.value,
      msrp,
      minAllowedPrice: minAllowed,
      withinBounds,
      severity: withinBounds ? "info" : "critical",
      context: withinBounds
        ? `${((1 - price.value / msrp) * 100).toFixed(1)}% discount`
        : `Below margin floor by $${(minAllowed - price.value).toLocaleString("en-CA")}`,
    });
  }

  // Step 3: Check consistency with all active offers
  if (activeOffers) {
    const allOffers = Object.values(activeOffers);
    for (const price of vehiclePrices) {
      for (const offer of allOffers) {
        // Skip known reference values for this offer
        if (
          price.value === offer.msrp ||
          price.value === offer.destinationFee ||
          price.value === offer.totalOTDEstimate ||
          price.value === offer.offeredPrice
        ) continue;

        // Flag prices close to but different from the offered price
        const diff = Math.abs(price.value - offer.offeredPrice);
        if (diff > 50 && diff < 3000) {
          checks.push({
            vehicleName: "Offer mismatch",
            mentionedPrice: price.value,
            msrp: offer.msrp,
            minAllowedPrice: offer.offeredPrice,
            withinBounds: false,
            severity: "warning",
            context: `Offer is $${offer.offeredPrice.toLocaleString("en-CA")} but response says $${price.value.toLocaleString("en-CA")}`,
          });
          break; // One flag per price is enough
        }
      }
    }
  }

  return {
    passed: !checks.some((c) => c.severity === "critical"),
    checks,
  };
}
