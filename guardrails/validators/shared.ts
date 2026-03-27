import { db } from "@/lib/db";
import { vehicles, pricing } from "@/lib/schema";
import { eq } from "drizzle-orm";

// ── Price extraction ─────────────────────────────────────────────

const PRICE_RE = /\$\s*([\d,]+(?:\.\d{2})?)/g;

export interface ExtractedPrice {
  value: number;
  index: number;
  raw: string;
}

/** Extract all dollar amounts from text. */
export function extractPrices(text: string): ExtractedPrice[] {
  return [...text.matchAll(PRICE_RE)].map((m) => ({
    value: parseFloat(m[1].replace(/,/g, "")),
    index: m.index!,
    raw: m[0],
  }));
}

// Contexts that indicate a price is NOT a vehicle sticker price
const NON_STICKER_RE = [
  /per\s*month/i, /monthly/i, /\/mo\b/i, /emi\b/i,
  /valued\s*at/i, /package.*valued/i, /value[d]?\s*\)/i,
  /cashback/i, /rebate/i, /savings?\b/i,
  /down\s*payment/i, /interest/i, /warranty/i,
  /accessories/i, /tire/i, /service/i,
];

/** Filter to prices that look like vehicle sticker prices ($8K-$120K, not EMI/extras). */
export function filterVehiclePrices(prices: ExtractedPrice[], text: string): ExtractedPrice[] {
  return prices.filter((p) => {
    if (p.value < 8000 || p.value > 120000) return false;
    const ctx = text.slice(Math.max(0, p.index - 60), p.index + p.raw.length + 60);
    return !NON_STICKER_RE.some((re) => re.test(ctx));
  });
}

// ── Vehicle resolution ───────────────────────────────────────────

export interface ResolvedVehicle {
  id: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  fuelType: string;
  horsepower: number;
  torqueLbFt: number;
  fuelEconomy: string;
  seating: number;
  airbags: number;
  safetyRating: string | null;
  cargoSpaceL: number | null;
  features: string[];
  drivetrain: string;
  msrp: string;
  dealerCost: string;
  marginFloorPct: string;
}

/**
 * Find which vehicles from our DB are mentioned in the given text.
 * Uses a single DB query — first loads all make/model pairs, then matches
 * against the text. Returns full data for matched vehicles.
 *
 * Results are cached per call via the returned map.
 */
export async function resolveVehiclesInText(text: string): Promise<Map<string, ResolvedVehicle>> {
  const lower = text.toLowerCase();
  const result = new Map<string, ResolvedVehicle>();

  // Load all make/model pairs (only 20 rows — fast)
  const allVehicles = await db
    .select({
      id: vehicles.id,
      make: vehicles.make,
      model: vehicles.model,
      variant: vehicles.variant,
      year: vehicles.year,
      fuelType: vehicles.fuelType,
      horsepower: vehicles.horsepower,
      torqueLbFt: vehicles.torqueLbFt,
      fuelEconomy: vehicles.fuelEconomy,
      seating: vehicles.seating,
      airbags: vehicles.airbags,
      safetyRating: vehicles.safetyRating,
      cargoSpaceL: vehicles.cargoSpaceL,
      features: vehicles.features,
      drivetrain: vehicles.drivetrain,
      msrp: pricing.msrp,
      dealerCost: pricing.dealerCost,
      marginFloorPct: pricing.marginFloorPct,
    })
    .from(vehicles)
    .innerJoin(pricing, eq(vehicles.id, pricing.vehicleId));

  for (const v of allVehicles) {
    const fullName = `${v.make} ${v.model}`.toLowerCase();
    const modelOnly = v.model.toLowerCase();
    // Also try without hyphens: "CR-V" → "crv", "F-150" → "f150"
    const modelNorm = modelOnly.replace(/[-\s]/g, "");

    if (lower.includes(fullName) || lower.includes(modelOnly) || lower.includes(modelNorm)) {
      result.set(v.id, v as ResolvedVehicle);
    }
  }

  return result;
}

/** Get the text window around a position for context matching. */
export function textWindow(text: string, pos: number, before = 300, after = 300): string {
  return text.slice(Math.max(0, pos - before), pos + after).toLowerCase();
}

/** Check if a vehicle is mentioned near a given position in text. */
export function isVehicleNearPosition(
  text: string,
  pos: number,
  vehicle: ResolvedVehicle,
  windowSize = 300,
): boolean {
  const window = textWindow(text, pos, windowSize, 100);
  const fullName = `${vehicle.make} ${vehicle.model}`.toLowerCase();
  const modelOnly = vehicle.model.toLowerCase();
  return window.includes(fullName) || window.includes(modelOnly);
}
