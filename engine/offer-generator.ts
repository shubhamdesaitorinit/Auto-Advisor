import type {
  ConstraintResult,
  VehiclePricing,
  BuyerProfile,
  Offer,
  OfferExtra,
} from "@/types";

/**
 * Deterministic offer generator. No LLM involved.
 *
 * Strategy: Always apply a real price reduction to close the budget gap,
 * THEN sweeten with high-efficiency extras (warranty, accessories, winter tires).
 * Extras add perceived value but the buyer needs to see the sticker price move.
 */
export function generateOffer(
  constraints: ConstraintResult,
  pricing: VehiclePricing,
  buyerProfile: BuyerProfile,
): Offer {
  const extras: OfferExtra[] = [];
  let totalDealerCost = 0;
  let totalPerceivedValue = 0;
  let priceReduction = 0;

  const hasGap = constraints.budgetGap > 0;
  const wantsDeal = buyerProfile.dealSeeking || buyerProfile.negotiationIntent || buyerProfile.priceResistance;

  // ── Step 1: Manufacturer cashback (free money from OEM) ────────
  if (pricing.cashbackOffer && pricing.cashbackOffer > 0) {
    priceReduction += pricing.cashbackOffer;
    extras.push({
      type: "cashback",
      dealerCost: 0,
      perceivedValue: pricing.cashbackOffer,
      description: `$${pricing.cashbackOffer.toLocaleString("en-CA")} manufacturer cashback`,
    });
  }

  // ── Step 2: Direct price cut to close the budget gap ───────────
  // This is the real price movement the buyer sees on the sticker.
  // We apply this BEFORE extras so the price actually comes down.
  if (hasGap) {
    const gapAfterCashback = Math.max(0, constraints.budgetGap - priceReduction);
    if (gapAfterCashback > 0) {
      const maxCut = Math.max(0, constraints.maxDiscount - priceReduction);
      const priceCut = Math.min(gapAfterCashback, maxCut);
      priceReduction += priceCut;
    }
  } else if (wantsDeal) {
    // No specific budget gap, but buyer wants a deal — give a modest cut
    const modestCutPct = constraints.inventoryPressure === "high" ? 0.03
      : constraints.inventoryPressure === "medium" ? 0.02 : 0.01;
    const modestCut = Math.min(
      Math.round(pricing.msrp * modestCutPct),
      constraints.maxDiscount - priceReduction,
    );
    if (modestCut > 0) priceReduction += modestCut;
  } else if (constraints.inventoryPressure !== "low") {
    // No gap, not deal-seeking, but old inventory — goodwill discount
    const goodwillPct = constraints.inventoryPressure === "high" ? 0.025 : 0.01;
    const goodwill = Math.min(
      Math.round(pricing.msrp * goodwillPct),
      constraints.maxDiscount,
    );
    if (goodwill > 0) priceReduction += goodwill;
  }

  // ── Step 3: Sweeten with high-efficiency extras ────────────────
  // These add perceived value on top of the price cut.

  if (hasGap || wantsDeal) {
    // Extended warranty — 3.1x efficiency
    extras.push({
      type: "extended_warranty",
      dealerCost: pricing.warrantyExtCost,
      perceivedValue: pricing.warrantyExtValue,
      description: `Extended warranty package (valued at $${pricing.warrantyExtValue.toLocaleString("en-CA")})`,
    });
    totalPerceivedValue += pricing.warrantyExtValue;
    totalDealerCost += pricing.warrantyExtCost;

    // Accessories bundle — 3.0x efficiency
    extras.push({
      type: "accessories",
      dealerCost: pricing.accessoriesCost,
      perceivedValue: pricing.accessoriesValue,
      description: `All-weather mats, cargo tray & paint protection (valued at $${pricing.accessoriesValue.toLocaleString("en-CA")})`,
    });
    totalPerceivedValue += pricing.accessoriesValue;
    totalDealerCost += pricing.accessoriesCost;
  }

  // Winter tires — always valuable for Canadian buyers when negotiating
  if (hasGap || wantsDeal) {
    const winterTireCost = 600;
    const winterTireValue = 1500;
    extras.push({
      type: "winter_tires",
      dealerCost: winterTireCost,
      perceivedValue: winterTireValue,
      description: `Winter tire & rim package (valued at $${winterTireValue.toLocaleString("en-CA")})`,
    });
    totalPerceivedValue += winterTireValue;
    totalDealerCost += winterTireCost;
  }

  // ── Step 4: Promotional financing ──────────────────────────────
  if (pricing.financingRatePct !== null && (buyerProfile.financeInterest || hasGap)) {
    extras.push({
      type: "promotional_financing",
      dealerCost: 0,
      perceivedValue: 0,
      rate: pricing.financingRatePct,
      description: `${pricing.financingRatePct}% promotional financing available`,
    });
  }

  // ── Step 5: Margin check — pull back if we've overextended ─────
  // If the combined price cut + extras cost pushes below margin floor,
  // reduce the price cut to stay viable (keep extras since they're high-efficiency).
  let offeredPrice = pricing.msrp - priceReduction;
  const minViablePrice = (pricing.dealerCost + totalDealerCost) / (1 - pricing.marginFloorPct);

  if (offeredPrice < minViablePrice && priceReduction > 0) {
    // Pull back the price cut to maintain margin floor
    const maxViableCut = Math.max(0, pricing.msrp - Math.ceil(minViablePrice));
    priceReduction = Math.min(priceReduction, maxViableCut);
    offeredPrice = pricing.msrp - priceReduction;
  }

  const discountPct = pricing.msrp > 0 ? priceReduction / pricing.msrp : 0;
  const marginRetained =
    offeredPrice > 0
      ? (offeredPrice - pricing.dealerCost - totalDealerCost) / offeredPrice
      : 0;

  // ── Step 6: Determine approval path ────────────────────────────
  let approvalStatus: "auto_approved" | "needs_manager" | "rejected";
  if (marginRetained < pricing.marginFloorPct) {
    // Even after pullback, still below floor — offer is rejected
    approvalStatus = "rejected";
  } else if (discountPct > 0.05) {
    approvalStatus = "needs_manager";
  } else {
    approvalStatus = "auto_approved";
  }

  return {
    vehicleId: pricing.vehicleId,
    msrp: pricing.msrp,
    offeredPrice,
    discountAmount: priceReduction,
    discountPct,
    destinationFee: pricing.destinationFee,
    totalOTDEstimate: offeredPrice + pricing.destinationFee,
    extras,
    totalPerceivedSavings: priceReduction + totalPerceivedValue,
    marginRetainedPct: marginRetained,
    approvalStatus,
    validForHours: 48,
    justification: generateJustification(constraints, buyerProfile),
  };
}

function generateJustification(
  constraints: ConstraintResult,
  buyerProfile: BuyerProfile,
): string {
  const reasons: string[] = [];

  if (constraints.inventoryPressure === "high")
    reasons.push("Vehicle on lot 90+ days");
  if (constraints.inventoryPressure === "medium")
    reasons.push("Vehicle on lot 60+ days");
  if (constraints.competitivePressure > 0)
    reasons.push(
      `Competitor priced $${constraints.competitivePressure.toLocaleString("en-CA")} lower`,
    );
  if (buyerProfile.urgency === "high")
    reasons.push("Buyer indicated urgency to purchase");
  if (buyerProfile.competitorAnchor)
    reasons.push(
      `Buyer referenced competitor price of $${buyerProfile.competitorAnchor.toLocaleString("en-CA")}`,
    );
  if (buyerProfile.priceResistance)
    reasons.push("Buyer showed price resistance");
  if (buyerProfile.budgetMax)
    reasons.push(
      `Buyer budget max: $${buyerProfile.budgetMax.toLocaleString("en-CA")}`,
    );

  return reasons.length > 0 ? reasons.join(". ") : "Standard offer";
}
