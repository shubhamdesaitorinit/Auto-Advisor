import { streamText, stepCountIs, type ModelMessage } from "ai";
import { tool } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { getLLM } from "@/lib/llm";
import { LEAD_CAPTURE_SYSTEM_PROMPT } from "@/prompts/lead-capture";
import { scoreLead } from "@/engine/lead-scorer";
import { saveLead, getLeadBySession } from "@/tools/lead-db";
import { sendVehicleInfoEmail, sendLeadNotification } from "@/lib/email";
import { getVehicleDetails } from "@/tools/vehicle-db";
import type { Session } from "@/types";
import type { Logger } from "pino";
import { logger as rootLogger } from "@/lib/logger";

function createLeadCaptureTools(session: Session, log: Logger) {
  return {
    extract_contact_info: tool({
      description:
        "Extract contact information (name, email, phone) from the conversation messages. Scans the FULL conversation history.",
      inputSchema: z.object({
        name: z.string().optional().describe("Customer name if mentioned"),
        email: z.string().optional().describe("Customer email if mentioned"),
        phone: z.string().optional().describe("Customer phone if mentioned"),
      }),
      execute: async (params) => {
        log.info(
          { tool: "extract_contact_info", hasName: !!params.name, hasEmail: !!params.email, hasPhone: !!params.phone },
          "Contact info extracted",
        );
        return {
          name: params.name ?? null,
          email: params.email ?? null,
          phone: params.phone ?? null,
          hasContact: !!(params.name || params.email || params.phone),
        };
      },
    }),

    generate_conversation_summary: tool({
      description:
        "Generate a concise 3-5 sentence summary of the conversation for the sales team. Include vehicles discussed, budget, stage, and recommended next action.",
      inputSchema: z.object({
        summary: z.string().describe("The conversation summary for the sales team"),
      }),
      execute: async (params) => {
        log.info({ tool: "generate_conversation_summary" }, "Summary generated");
        return { summary: params.summary };
      },
    }),

    capture_lead: tool({
      description:
        "Save the lead to the database and trigger appropriate follow-up emails based on lead score.",
      inputSchema: z.object({
        customer_name: z.string().optional(),
        customer_email: z.string().optional(),
        customer_phone: z.string().optional(),
        conversation_summary: z.string().describe("Summary of the conversation"),
      }),
      execute: async (params) => {
        log.info({ tool: "capture_lead", hasEmail: !!params.customer_email }, "Capturing lead");

        // Check if lead already captured for this session
        const existing = await getLeadBySession(session.id);
        if (existing) {
          log.info({ tool: "capture_lead" }, "Lead already captured for this session");
          return { alreadyCaptured: true, leadId: existing.id };
        }

        // Score the lead deterministically
        const scoreResult = scoreLead(session);

        // Get vehicle details for interested vehicles
        const vehiclesInterested: Array<{ id: string; name: string }> = [];
        for (const vid of session.vehiclesViewed.slice(0, 5)) {
          const v = await getVehicleDetails(vid);
          if (v) {
            vehiclesInterested.push({ id: vid, name: `${v.make} ${v.model} ${v.variant}` });
          }
        }

        // Save lead to DB
        const leadId = await saveLead({
          sessionId: session.id,
          customerName: params.customer_name,
          customerEmail: params.customer_email,
          customerPhone: params.customer_phone,
          score: scoreResult.score,
          scoreDetails: {
            totalPoints: scoreResult.totalPoints,
            maxPoints: scoreResult.maxPoints,
            signals: scoreResult.signals.filter((s) => s.detected).map((s) => s.signal),
          },
          vehiclesInterested,
          budgetRange: session.buyerProfile.budgetMax
            ? { min: session.buyerProfile.budgetMin, max: session.buyerProfile.budgetMax }
            : undefined,
          buyerProfile: session.buyerProfile as unknown as Record<string, unknown>,
          conversationSummary: params.conversation_summary,
        });

        // Send emails based on lead score
        const emailActions: string[] = [];

        // Send vehicle info email to customer (if we have their email)
        if (params.customer_email && vehiclesInterested.length > 0) {
          const vehicleDetails = await Promise.all(
            vehiclesInterested.slice(0, 3).map(async (vi) => {
              const v = await getVehicleDetails(vi.id);
              return v
                ? {
                    name: `${v.make} ${v.model}`,
                    variant: v.variant,
                    price: Number(v.msrp),
                    fuelEconomy: `${v.fuelEconomy} ${v.fuelType === "Electric" ? "kWh/100km" : "L/100km"}`,
                    keyFeatures: (v.features as string[]).slice(0, 4).map((f: string) =>
                      f.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
                    ),
                  }
                : null;
            }),
          );

          const validDetails = vehicleDetails.filter(
            (d): d is NonNullable<typeof d> => d !== null,
          );

          if (validDetails.length > 0) {
            await sendVehicleInfoEmail({
              to: params.customer_email,
              customerName: params.customer_name,
              vehicles: validDetails,
              personalNote: params.conversation_summary,
            });
            emailActions.push("vehicle_info_sent_to_customer");
          }
        }

        // Send internal notification for warm/hot leads
        if (scoreResult.score !== "cold") {
          await sendLeadNotification({
            leadScore: scoreResult.score,
            customerName: params.customer_name,
            customerEmail: params.customer_email,
            customerPhone: params.customer_phone,
            vehiclesInterested: vehiclesInterested.map((v) => v.name),
            conversationSummary: params.conversation_summary,
            budgetRange: session.buyerProfile.budgetMax
              ? { min: session.buyerProfile.budgetMin, max: session.buyerProfile.budgetMax }
              : undefined,
          });
          emailActions.push("internal_notification_sent");
        }

        log.info(
          { tool: "capture_lead", leadId, score: scoreResult.score, points: scoreResult.totalPoints, emails: emailActions },
          "Lead captured",
        );

        return {
          leadId,
          score: scoreResult.score,
          totalPoints: scoreResult.totalPoints,
          emailActions,
        };
      },
    }),
  };
}

export function runLeadCaptureAgent(
  messages: ModelMessage[],
  session: Session,
  log?: Logger,
  onFinish?: (event: { text: string }) => void,
) {
  const tools = createLeadCaptureTools(session, log ?? rootLogger);

  return streamText({
    model: getLLM(),
    system: LEAD_CAPTURE_SYSTEM_PROMPT,
    messages,
    tools,
    stopWhen: stepCountIs(5),
    onFinish,
  });
}
