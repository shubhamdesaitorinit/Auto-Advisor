import { db } from "@/lib/db";
import { vehicles, pricing } from "@/lib/schema";
import { eq, and, gte, lte, ilike, sql, desc, asc } from "drizzle-orm";
import { generateEmbedding } from "@/lib/embeddings";

// ── Shared joins ────────────────────────────────────────────────────
const vehicleWithPricing = {
  id: vehicles.id,
  make: vehicles.make,
  model: vehicles.model,
  variant: vehicles.variant,
  year: vehicles.year,
  bodyType: vehicles.bodyType,
  fuelType: vehicles.fuelType,
  transmission: vehicles.transmission,
  drivetrain: vehicles.drivetrain,
  engineSpec: vehicles.engineSpec,
  horsepower: vehicles.horsepower,
  torqueLbFt: vehicles.torqueLbFt,
  fuelEconomy: vehicles.fuelEconomy,
  seating: vehicles.seating,
  safetyRating: vehicles.safetyRating,
  airbags: vehicles.airbags,
  features: vehicles.features,
  colors: vehicles.colors,
  description: vehicles.description,
  cargoSpaceL: vehicles.cargoSpaceL,
  winterReady: vehicles.winterReady,
  msrp: pricing.msrp,
  destinationFee: pricing.destinationFee,
  stockQuantity: pricing.stockQuantity,
  inventoryAgeDays: pricing.inventoryAgeDays,
  financingRatePct: pricing.financingRatePct,
  cashbackOffer: pricing.cashbackOffer,
  competitorName: pricing.competitorName,
  competitorPrice: pricing.competitorPrice,
};

// ── search_vehicles ─────────────────────────────────────────────────
export interface SearchVehiclesParams {
  budgetMax?: number;
  budgetMin?: number;
  bodyType?: string;
  fuelType?: string;
  drivetrain?: string;
  features?: string[];
  seatingMin?: number;
  query?: string;
  winterReady?: boolean;
}

export async function searchVehicles(params: SearchVehiclesParams) {
  const conditions = [];

  if (params.budgetMax) {
    conditions.push(lte(pricing.msrp, String(params.budgetMax)));
  }
  if (params.budgetMin) {
    conditions.push(gte(pricing.msrp, String(params.budgetMin)));
  }
  if (params.bodyType) {
    conditions.push(ilike(vehicles.bodyType, params.bodyType));
  }
  if (params.fuelType) {
    conditions.push(ilike(vehicles.fuelType, params.fuelType));
  }
  if (params.drivetrain) {
    conditions.push(ilike(vehicles.drivetrain, params.drivetrain));
  }
  if (params.seatingMin) {
    conditions.push(gte(vehicles.seating, params.seatingMin));
  }
  if (params.winterReady) {
    conditions.push(eq(vehicles.winterReady, true));
  }

  // If there's a natural language query, try vector search
  if (params.query) {
    try {
      const embedding = await generateEmbedding(params.query);
      const similarity = sql<number>`1 - (${vehicles.descriptionEmbedding} <=> ${JSON.stringify(embedding)}::vector)`;

      const results = await db
        .select({ ...vehicleWithPricing, similarity })
        .from(vehicles)
        .innerJoin(pricing, eq(vehicles.id, pricing.vehicleId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(similarity))
        .limit(5);

      return results;
    } catch {
      // Fall through to structured search if embedding fails
    }
  }

  // Structured search (no vector)
  const results = await db
    .select(vehicleWithPricing)
    .from(vehicles)
    .innerJoin(pricing, eq(vehicles.id, pricing.vehicleId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(pricing.stockQuantity), asc(pricing.inventoryAgeDays))
    .limit(5);

  return results;
}

// ── get_vehicle_details ─────────────────────────────────────────────
export async function getVehicleDetails(vehicleId: string) {
  const fullPricing = {
    ...vehicleWithPricing,
    dealerCost: pricing.dealerCost,
    marginFloorPct: pricing.marginFloorPct,
    maxDiscountPct: pricing.maxDiscountPct,
    accessoriesCost: pricing.accessoriesCost,
    accessoriesValue: pricing.accessoriesValue,
    warrantyExtCost: pricing.warrantyExtCost,
    warrantyExtValue: pricing.warrantyExtValue,
  };

  const [result] = await db
    .select(vehicleWithPricing)
    .from(vehicles)
    .innerJoin(pricing, eq(vehicles.id, pricing.vehicleId))
    .where(eq(vehicles.id, vehicleId))
    .limit(1);

  return result ?? null;
}

// ── compare_vehicles ────────────────────────────────────────────────
export async function compareVehicles(vehicleIds: string[]) {
  const results = await Promise.all(vehicleIds.map(getVehicleDetails));
  const valid = results.filter(Boolean);

  if (valid.length < 2) return { vehicles: valid, differences: [] };

  // Identify key differences
  const differences: string[] = [];
  const first = valid[0];

  const priceDiff = Math.abs(Number(valid[0].msrp) - Number(valid[1].msrp));
  if (priceDiff > 2000) {
    differences.push(`Price difference: $${priceDiff.toLocaleString()} CAD`);
  }

  const feDiff = Math.abs(Number(valid[0].fuelEconomy) - Number(valid[1].fuelEconomy));
  if (feDiff > 1) {
    differences.push(`Fuel economy difference: ${feDiff.toFixed(1)} L/100km`);
  }

  if (valid[0].drivetrain !== valid[1].drivetrain) {
    differences.push(`Drivetrain: ${valid[0].drivetrain} vs ${valid[1].drivetrain}`);
  }

  if (valid[0].seating !== valid[1].seating) {
    differences.push(`Seating: ${valid[0].seating} vs ${valid[1].seating}`);
  }

  if (valid[0].horsepower !== valid[1].horsepower) {
    differences.push(`Power: ${valid[0].horsepower} hp vs ${valid[1].horsepower} hp`);
  }

  const cargo0 = valid[0].cargoSpaceL ?? 0;
  const cargo1 = valid[1].cargoSpaceL ?? 0;
  if (Math.abs(cargo0 - cargo1) > 50) {
    differences.push(`Cargo space: ${cargo0}L vs ${cargo1}L`);
  }

  return { vehicles: valid, differences };
}

// ── get_similar_vehicles ────────────────────────────────────────────
export async function getSimilarVehicles(vehicleId: string, limit = 3) {
  const [source] = await db
    .select({
      descriptionEmbedding: vehicles.descriptionEmbedding,
    })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId))
    .limit(1);

  if (!source?.descriptionEmbedding) {
    // Fallback: return vehicles of the same body type
    const [sourceVehicle] = await db
      .select({ bodyType: vehicles.bodyType })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);

    if (!sourceVehicle) return [];

    return db
      .select(vehicleWithPricing)
      .from(vehicles)
      .innerJoin(pricing, eq(vehicles.id, pricing.vehicleId))
      .where(
        and(
          ilike(vehicles.bodyType, sourceVehicle.bodyType),
          sql`${vehicles.id} != ${vehicleId}`,
        ),
      )
      .limit(limit);
  }

  const embedding = source.descriptionEmbedding;
  const similarity = sql<number>`1 - (${vehicles.descriptionEmbedding} <=> ${JSON.stringify(embedding)}::vector)`;

  return db
    .select({ ...vehicleWithPricing, similarity })
    .from(vehicles)
    .innerJoin(pricing, eq(vehicles.id, pricing.vehicleId))
    .where(sql`${vehicles.id} != ${vehicleId}`)
    .orderBy(desc(similarity))
    .limit(limit);
}
