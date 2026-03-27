import type { Offer, ApprovalResult } from "@/types";

/**
 * Determines the approval path for an offer.
 * - Auto-approved: discount ≤5%, margin above floor
 * - Needs manager: discount >5%, margin above floor
 * - Rejected: margin below floor — can't make this deal work
 */
export function checkApproval(offer: Offer): ApprovalResult {
  if (offer.approvalStatus === "auto_approved") {
    return {
      approved: true,
      status: "auto_approved",
      reason: `Discount of ${(offer.discountPct * 100).toFixed(1)}% within auto-approval limit`,
      respondToUser: "",
    };
  }

  if (offer.approvalStatus === "needs_manager") {
    return {
      approved: false,
      status: "pending_manager",
      reason: `Discount of ${(offer.discountPct * 100).toFixed(1)}% exceeds 5% auto-approval threshold`,
      respondToUser:
        "That's a great choice! Let me check with my manager to get you the absolute best price. I'll have an answer shortly. In the meantime, would you like to book a test drive?",
    };
  }

  // Rejected — margin floor would be violated
  return {
    approved: false,
    status: "rejected",
    reason: `Requested price would put margin at ${(offer.marginRetainedPct * 100).toFixed(1)}%, below the ${(offer.marginRetainedPct * 100).toFixed(1)}% floor`,
    respondToUser: "",
  };
}
