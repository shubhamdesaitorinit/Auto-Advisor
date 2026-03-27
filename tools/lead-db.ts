import { db } from "@/lib/db";
import { leads, conversations } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function saveLead(params: {
  sessionId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  score: string;
  scoreDetails: Record<string, unknown>;
  vehiclesInterested: Array<{ id: string; name: string }>;
  budgetRange?: { min?: number; max?: number };
  buyerProfile: Record<string, unknown>;
  conversationSummary?: string;
}): Promise<string> {
  try {
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
    }

    const [lead] = await db
      .insert(leads)
      .values({
        conversationId: convo?.id,
        sessionId: params.sessionId,
        customerName: params.customerName,
        customerEmail: params.customerEmail,
        customerPhone: params.customerPhone,
        score: params.score,
        scoreDetails: params.scoreDetails,
        vehiclesInterested: params.vehiclesInterested,
        budgetRange: params.budgetRange,
        buyerProfile: params.buyerProfile,
        conversationSummary: params.conversationSummary,
        emailSent: !!params.customerEmail,
        emailSentAt: params.customerEmail ? new Date() : undefined,
      })
      .returning({ id: leads.id });

    return lead.id;
  } catch (err) {
    console.error("Failed to save lead:", err);
    return `unsaved-${Date.now()}`;
  }
}

export async function getLeadBySession(sessionId: string) {
  try {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.sessionId, sessionId))
      .limit(1);
    return lead ?? null;
  } catch {
    return null;
  }
}
