import { streamText, stepCountIs, type ModelMessage } from "ai";
import { tool } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { getLLM } from "@/lib/llm";
import { NEGOTIATION_SYSTEM_PROMPT } from "@/prompts/negotiation";
import { getFullPricing, saveOffer, updateOfferStatus } from "@/tools/negotiation-db";
import { updateBuyerProfile } from "@/engine/budget-tracker";
import { solveConstraints } from "@/engine/constraint-solver";
import { generateOffer } from "@/engine/offer-generator";
import { checkApproval } from "@/engine/approval-gate";
import { generateFinancingOptions } from "@/engine/financing";
import type { BuyerProfile, BuyerSignal } from "@/types";
import type { Logger } from "pino";

/**
 * Build negotiation tools. Session ID and buyer profile are captured
 * in closure so the tools can update state.
 */
function createNegotiationTools(sessionId: string, buyerProfile: BuyerProfile, log: Logger) {
  // Mutable reference so tools can update across calls within one request
  let currentProfile = { ...buyerProfile };

  return {
    currentProfile: () => currentProfile,

    tools: {
      extract_budget_signals: tool({
        description:
          "Analyze the buyer's message to extract budget signals, urgency, financing interest, competitor references, and negotiation intent. Returns structured signals.",
        inputSchema: z.object({
          signals: z.array(
            z.object({
              type: z.enum(["explicit", "soft", "behavioral"]),
              signal: z
                .string()
                .describe(
                  "Signal name: budget_max, budget_min, includes_fees, price_resistance, negotiation_intent, hesitation, finance_interest, rate_sensitive, competitor_anchor, competitor_vehicle, urgency, deal_seeking, has_trade_in, trade_in_vehicle",
                ),
              value: z.union([z.string(), z.number(), z.boolean()]).describe(
                "The extracted value — e.g. 42000 for budget_max, true for price_resistance, 'high' for urgency",
              ),
            }),
          ),
        }),
        execute: async (params) => {
          log.info({ tool: "extract_budget_signals", signalCount: params.signals.length, signals: params.signals.map(s => s.signal) }, "Extracting budget signals");
          const newSignals: BuyerSignal[] = params.signals.map((s) => ({
            type: s.type,
            signal: s.signal,
            value: s.value,
            turn: currentProfile.signals.length,
            timestamp: Date.now(),
          }));

          currentProfile = updateBuyerProfile(currentProfile, newSignals);

          return {
            profileUpdated: true,
            budgetMax: currentProfile.budgetMax,
            budgetMin: currentProfile.budgetMin,
            urgency: currentProfile.urgency,
            financeInterest: currentProfile.financeInterest,
            priceResistance: currentProfile.priceResistance,
            negotiationIntent: currentProfile.negotiationIntent,
            dealSeeking: currentProfile.dealSeeking,
            competitorAnchor: currentProfile.competitorAnchor,
            signalCount: currentProfile.signals.length,
          };
        },
      }),

      get_pricing_data: tool({
        description:
          "Look up a vehicle's pricing data including MSRP, promotions, inventory status, and available extras. Use this before generating an offer.",
        inputSchema: z.object({
          vehicle_id: z.string().describe("The UUID of the vehicle"),
        }),
        execute: async (params) => {
          log.info({ tool: "get_pricing_data", vehicleId: params.vehicle_id }, "Fetching pricing data");
          const pricingData = await getFullPricing(params.vehicle_id);
          if (!pricingData) {
            log.warn({ tool: "get_pricing_data", vehicleId: params.vehicle_id }, "Vehicle not found");
            return { error: "Vehicle not found" };
          }

          log.info({ tool: "get_pricing_data", msrp: pricingData.msrp, inventoryAgeDays: pricingData.inventoryAgeDays }, "Pricing data loaded");
          return {
            vehicleId: pricingData.vehicleId,
            msrp: pricingData.msrp,
            destinationFee: pricingData.destinationFee,
            inventoryAgeDays: pricingData.inventoryAgeDays,
            stockQuantity: pricingData.stockQuantity,
            financingRatePct: pricingData.financingRatePct,
            cashbackOffer: pricingData.cashbackOffer,
            competitorName: pricingData.competitorName,
            competitorPrice: pricingData.competitorPrice,
            hasExtendedWarranty: pricingData.warrantyExtValue > 0,
            hasAccessoriesBundle: pricingData.accessoriesValue > 0,
            // NOT exposing: dealerCost, marginFloorPct, maxDiscountPct, costs
          };
        },
      }),

      generate_offer: tool({
        description:
          "Generate a structured deal offer for a vehicle using the constraint solver. This tool computes pricing deterministically — ALWAYS use this instead of calculating prices yourself. It applies high-efficiency levers (warranty, accessories, winter tires) before direct price cuts.",
        inputSchema: z.object({
          vehicle_id: z.string().describe("The UUID of the vehicle to make an offer on"),
        }),
        execute: async (params) => {
          log.info({ tool: "generate_offer", vehicleId: params.vehicle_id, budgetMax: currentProfile.budgetMax }, "Generating offer");
          const pricingData = await getFullPricing(params.vehicle_id);
          if (!pricingData) {
            log.warn({ tool: "generate_offer", vehicleId: params.vehicle_id }, "Vehicle not found");
            return { error: "Vehicle not found — cannot generate offer" };
          }

          const constraints = solveConstraints(pricingData, currentProfile);
          const offer = generateOffer(constraints, pricingData, currentProfile);
          const approval = checkApproval(offer);

          log.info({
            tool: "generate_offer",
            msrp: offer.msrp,
            offeredPrice: offer.offeredPrice,
            discountAmount: offer.discountAmount,
            discountPct: Math.round(offer.discountPct * 1000) / 10,
            extras: offer.extras.map(e => e.type),
            totalSavings: offer.totalPerceivedSavings,
            marginPct: Math.round(offer.marginRetainedPct * 1000) / 10,
            approvalStatus: approval.status,
            canMeetBudget: constraints.canMeetBudget,
          }, "Offer generated");

          // Save to DB for audit trail
          const offerId = await saveOffer(offer, sessionId);
          offer.id = offerId;

          // Return offer details the agent can present to the user
          // Note: marginRetainedPct is NOT included — internal only
          return {
            offerId,
            msrp: offer.msrp,
            offeredPrice: offer.offeredPrice,
            discountAmount: offer.discountAmount,
            discountPct: Math.round(offer.discountPct * 1000) / 10,
            destinationFee: offer.destinationFee,
            totalOTDEstimate: offer.totalOTDEstimate,
            extras: offer.extras.map((e) => ({
              type: e.type,
              perceivedValue: e.perceivedValue,
              description: e.description,
              rate: e.rate,
            })),
            totalPerceivedSavings: offer.totalPerceivedSavings,
            approvalStatus: approval.status,
            approvalReason: approval.approved ? "Approved" : approval.respondToUser || approval.reason,
            canMeetBudget: constraints.canMeetBudget,
            validForHours: offer.validForHours,
          };
        },
      }),

      calculate_financing: tool({
        description:
          "Calculate monthly payment (EMI) options for a vehicle price. Returns options for 3, 4, 5, 6, and 7 year terms.",
        inputSchema: z.object({
          vehicle_price: z.number().describe("Total vehicle price in CAD"),
          down_payment: z
            .number()
            .default(0)
            .describe("Down payment amount in CAD (default: 0)"),
          promotional_rate: z
            .number()
            .optional()
            .describe("Promotional financing rate if available (e.g. 3.99)"),
        }),
        execute: async (params) => {
          log.info({ tool: "calculate_financing", vehiclePrice: params.vehicle_price, downPayment: params.down_payment, rate: params.promotional_rate }, "Calculating financing options");
          const options = generateFinancingOptions(
            params.vehicle_price,
            params.down_payment,
            params.promotional_rate,
          );
          return {
            principal: params.vehicle_price - params.down_payment,
            rate: params.promotional_rate ?? 6.99,
            options: options.map((o) => ({
              term: o.label,
              monthlyPayment: o.emi,
              totalPayment: o.totalPayment,
              totalInterest: o.totalInterest,
            })),
          };
        },
      }),

      submit_for_approval: tool({
        description:
          "Submit an offer that needs manager approval. In demo mode, this simulates a brief manager review and returns the result.",
        inputSchema: z.object({
          offer_id: z.string().describe("The offer ID to submit for approval"),
        }),
        execute: async (params) => {
          log.info({ tool: "submit_for_approval", offerId: params.offer_id }, "Submitting offer for manager approval");
          // Simulate manager review delay (demo mode)
          await new Promise((r) => setTimeout(r, 3000));

          // In demo mode, always approve
          await updateOfferStatus(params.offer_id, "approved");

          return {
            offerId: params.offer_id,
            status: "approved",
            message:
              "Great news! My manager has approved this special pricing for you. This offer is valid for 48 hours.",
          };
        },
      }),
    },
  };
}

/**
 * Run the negotiation agent.
 * Returns a streaming result that can be converted to a response.
 */
export function runNegotiationAgent(
  messages: ModelMessage[],
  sessionId: string,
  buyerProfile: BuyerProfile,
  log: Logger,
  onFinish?: (event: { text: string }) => void,
) {
  const { tools, currentProfile } = createNegotiationTools(
    sessionId,
    buyerProfile,
    log,
  );

  return {
    stream: streamText({
      model: getLLM(),
      system: NEGOTIATION_SYSTEM_PROMPT,
      messages,
      tools,
      stopWhen: stepCountIs(5),
      onFinish: (event) => {
        // Attach the updated profile to the event so the caller can persist it
        (event as unknown as Record<string, unknown>).__updatedProfile =
          currentProfile();
        onFinish?.(event);
      },
    }),
    getUpdatedProfile: currentProfile,
  };
}
