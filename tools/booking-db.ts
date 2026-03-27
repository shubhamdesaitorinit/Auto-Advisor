import { db } from "@/lib/db";
import { testDriveBookings, conversations, vehicles } from "@/lib/schema";
import { eq, ilike, or } from "drizzle-orm";
import { logger } from "@/lib/logger";

/**
 * Resolve a vehicle ID from either a UUID or a name/model string.
 * Returns the UUID and display name, or null if not found.
 */
export async function resolveVehicle(
  idOrName: string,
): Promise<{ id: string; name: string } | null> {
  try {
    // If it looks like a UUID, try direct lookup
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName);

    if (isUUID) {
      const [v] = await db
        .select({ id: vehicles.id, make: vehicles.make, model: vehicles.model, variant: vehicles.variant, year: vehicles.year })
        .from(vehicles)
        .where(eq(vehicles.id, idOrName))
        .limit(1);
      return v ? { id: v.id, name: `${v.year} ${v.make} ${v.model} ${v.variant}` } : null;
    }

    // Otherwise search by name/model
    const searchTerms = idOrName
      .replace(/[-_]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);

    if (searchTerms.length === 0) return null;

    // Query DB with WHERE conditions instead of fetching all vehicles
    const conditions = searchTerms.flatMap((t) => [
      ilike(vehicles.make, `%${t}%`),
      ilike(vehicles.model, `%${t}%`),
      ilike(vehicles.variant, `%${t}%`),
    ]);

    const rows = await db
      .select({ id: vehicles.id, make: vehicles.make, model: vehicles.model, variant: vehicles.variant, year: vehicles.year })
      .from(vehicles)
      .where(or(...conditions))
      .limit(10);

    if (rows.length === 0) return null;

    // Score matched vehicles by how many search terms hit
    let bestMatch = rows[0];
    let bestScore = 0;

    for (const v of rows) {
      const haystack = `${v.make} ${v.model} ${v.variant}`.toLowerCase();
      const score = searchTerms.filter((t) => haystack.includes(t.toLowerCase())).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = v;
      }
    }

    return { id: bestMatch.id, name: `${bestMatch.year} ${bestMatch.make} ${bestMatch.model} ${bestMatch.variant}` };
  } catch {
    return null;
  }
}

export async function saveBooking(params: {
  sessionId: string;
  vehicleId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  preferredDate: string;
  preferredTime: string;
  calendarEventId?: string;
  vehicleInfo: Record<string, string>;
  notes?: string;
}): Promise<string> {
  try {
    // Get or create conversation
    let [convo] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.sessionId, params.sessionId))
      .limit(1);

    if (!convo) {
      const result = await db
        .insert(conversations)
        .values({ sessionId: params.sessionId })
        .returning({ id: conversations.id });
      convo = result[0];
      if (!convo) throw new Error("Failed to create conversation");
    }

    const [booking] = await db
      .insert(testDriveBookings)
      .values({
        conversationId: convo.id,
        sessionId: params.sessionId,
        vehicleId: params.vehicleId,
        customerName: params.customerName,
        customerEmail: params.customerEmail,
        customerPhone: params.customerPhone,
        preferredDate: params.preferredDate,
        preferredTime: params.preferredTime,
        calendarEventId: params.calendarEventId,
        vehicleInfo: params.vehicleInfo,
        notes: params.notes,
        confirmationSent: !!params.calendarEventId,
      })
      .returning({ id: testDriveBookings.id });

    return booking.id;
  } catch (err) {
    logger.error({ err }, "Failed to save booking");
    return `unsaved-${Date.now()}`;
  }
}

export async function updateBookingStatus(
  bookingId: string,
  status: string,
  calendarEventId?: string,
): Promise<void> {
  try {
    const updates: Record<string, unknown> = { status, updatedAt: new Date() };
    if (calendarEventId !== undefined) updates.calendarEventId = calendarEventId;

    await db
      .update(testDriveBookings)
      .set(updates)
      .where(eq(testDriveBookings.id, bookingId));
  } catch (err) {
    logger.error({ err }, "Failed to update booking");
  }
}

export async function getBookingBySession(sessionId: string) {
  try {
    const [booking] = await db
      .select()
      .from(testDriveBookings)
      .where(eq(testDriveBookings.sessionId, sessionId))
      .limit(1);
    return booking ?? null;
  } catch {
    return null;
  }
}

export async function getVehicleNameById(vehicleId: string) {
  try {
    const [v] = await db
      .select({
        make: vehicles.make,
        model: vehicles.model,
        variant: vehicles.variant,
        year: vehicles.year,
      })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
      .limit(1);
    return v ? `${v.year} ${v.make} ${v.model} ${v.variant}` : null;
  } catch {
    return null;
  }
}
