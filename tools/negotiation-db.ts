import { db } from "@/lib/db";
import { vehicles, pricing, offers, conversations } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import type { VehiclePricing, Offer } from "@/types";

/**
 * Get FULL pricing data for a vehicle — including dealer cost and margins.
 * This is INTERNAL ONLY. Never expose dealer cost to the user or LLM output.
 */
export async function getFullPricing(
  vehicleId: string,
): Promise<VehiclePricing | null> {
  const [row] = await db
    .select({
      vehicleId: vehicles.id,
      msrp: pricing.msrp,
      dealerCost: pricing.dealerCost,
      marginFloorPct: pricing.marginFloorPct,
      competitorPrice: pricing.competitorPrice,
      competitorName: pricing.competitorName,
      inventoryAgeDays: pricing.inventoryAgeDays,
      stockQuantity: pricing.stockQuantity,
      maxDiscountPct: pricing.maxDiscountPct,
      destinationFee: pricing.destinationFee,
      accessoriesCost: pricing.accessoriesCost,
      accessoriesValue: pricing.accessoriesValue,
      warrantyExtCost: pricing.warrantyExtCost,
      warrantyExtValue: pricing.warrantyExtValue,
      financingRatePct: pricing.financingRatePct,
      cashbackOffer: pricing.cashbackOffer,
    })
    .from(vehicles)
    .innerJoin(pricing, eq(vehicles.id, pricing.vehicleId))
    .where(eq(vehicles.id, vehicleId))
    .limit(1);

  if (!row) return null;

  return {
    vehicleId: row.vehicleId,
    msrp: Number(row.msrp),
    dealerCost: Number(row.dealerCost),
    marginFloorPct: Number(row.marginFloorPct),
    competitorPrice: row.competitorPrice ? Number(row.competitorPrice) : null,
    competitorName: row.competitorName,
    inventoryAgeDays: row.inventoryAgeDays,
    stockQuantity: row.stockQuantity,
    maxDiscountPct: Number(row.maxDiscountPct),
    destinationFee: Number(row.destinationFee),
    accessoriesCost: Number(row.accessoriesCost),
    accessoriesValue: Number(row.accessoriesValue),
    warrantyExtCost: Number(row.warrantyExtCost),
    warrantyExtValue: Number(row.warrantyExtValue),
    financingRatePct: row.financingRatePct ? Number(row.financingRatePct) : null,
    cashbackOffer: row.cashbackOffer ? Number(row.cashbackOffer) : null,
  };
}

/**
 * Get public vehicle info (name, specs) for a vehicle — safe to show to user.
 */
export async function getVehicleName(
  vehicleId: string,
): Promise<{ make: string; model: string; variant: string; year: number } | null> {
  const [row] = await db
    .select({
      make: vehicles.make,
      model: vehicles.model,
      variant: vehicles.variant,
      year: vehicles.year,
    })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId))
    .limit(1);

  return row ?? null;
}

/**
 * Save an offer to PostgreSQL for audit trail.
 * Returns the generated offer ID.
 */
export async function saveOffer(
  offer: Offer,
  sessionId: string,
): Promise<string> {
  try {
    // Get or create a conversation record for this session
    let [convo] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.sessionId, sessionId))
      .limit(1);

    if (!convo) {
      const result = await db
        .insert(conversations)
        .values({ sessionId })
        .returning({ id: conversations.id });
      convo = result[0];
      if (!convo) throw new Error("Failed to create conversation record");
    }

    const [inserted] = await db
      .insert(offers)
      .values({
        conversationId: convo.id,
        vehicleId: offer.vehicleId,
        offeredPrice: String(offer.offeredPrice),
        discountAmount: String(offer.discountAmount),
        discountPct: String(offer.discountPct),
        marginRetainedPct: String(offer.marginRetainedPct),
        extrasIncluded: offer.extras.map((e) => e.description ?? e.type),
        approvalStatus: offer.approvalStatus,
        justification: offer.justification,
        expiresAt: new Date(Date.now() + offer.validForHours * 60 * 60 * 1000),
      })
      .returning({ id: offers.id });

    return inserted.id;
  } catch (err) {
    // Log but don't crash — return a placeholder ID so the agent can still respond
    logger.error({ err }, "Failed to save offer to DB");
    return `unsaved-${Date.now()}`;
  }
}

/**
 * Update an offer's approval status (for manager approval flow).
 */
export async function updateOfferStatus(
  offerId: string,
  status: string,
): Promise<void> {
  await db
    .update(offers)
    .set({ approvalStatus: status })
    .where(eq(offers.id, offerId));
}
