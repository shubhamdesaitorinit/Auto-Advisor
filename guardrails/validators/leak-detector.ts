import { extractPrices, type ResolvedVehicle } from "./shared";

export interface LeakIssue {
  pattern: string;
  matched: string;
  severity: "critical";
}

export interface LeakDetectionResult {
  passed: boolean;
  issues: LeakIssue[];
}

// ── Regex patterns for internal data leakage ─────────────────────
const LEAK_PATTERNS: { pattern: RegExp; label: string }[] = [
  // Dealer cost
  { pattern: /dealer\s*(?:cost|invoice|price)/i, label: "dealer_cost_term" },
  { pattern: /(?:our|the|my)\s*cost\s*(?:is|was|for|at|on)/i, label: "internal_cost" },
  { pattern: /invoice\s*price/i, label: "invoice_price" },
  { pattern: /wholesale\s*(?:price|cost)/i, label: "wholesale" },
  { pattern: /we\s*(?:paid|pay|bought\s*(?:it|them))\s*(?:for\s*)?\$/i, label: "purchase_cost" },

  // Margin / profit
  { pattern: /(?:our|the|my)\s*margin/i, label: "margin_reference" },
  { pattern: /\d+\.?\d*\s*%?\s*margin/i, label: "margin_percentage" },
  { pattern: /markup\s*(?:is|of|at|on)/i, label: "markup" },
  { pattern: /(?:our|the|my)\s*profit/i, label: "profit_reference" },
  { pattern: /making\s*\$?\d+\s*(?:on|per|from|each)/i, label: "profit_per_unit" },

  // Internal process
  { pattern: /margin\s*floor/i, label: "margin_floor" },
  { pattern: /approval\s*threshold/i, label: "approval_threshold" },
  { pattern: /auto[\s-]*approv(?:al|ed)\s*(?:limit|threshold|range)/i, label: "auto_approval" },
  { pattern: /(?:maximum|max)\s*(?:allowed\s*)?discount\s*(?:is|of|at)\s*\d/i, label: "max_discount" },
  { pattern: /discount\s*(?:limit|cap)\s*(?:is|of|at)\s*\d/i, label: "discount_limit" },

  // Floor price leaks
  { pattern: /(?:lowest|minimum|absolute\s*(?:lowest|bottom)|floor)\s*(?:price|we\s*can\s*(?:go|offer|do))/i, label: "floor_price" },
  { pattern: /can(?:'t|not)\s*go\s*(?:below|under|lower\s*than)\s*\$/i, label: "floor_price_indirect" },
  { pattern: /bottom\s*(?:line|dollar|price)\s*(?:is|would\s*be)\s*\$/i, label: "bottom_line" },
];

/**
 * Detect if the response leaks internal business data.
 * All leaks are CRITICAL — response should be blocked.
 *
 * Two-layer detection:
 * 1. Regex pattern matching for internal terminology
 * 2. Dollar amount matching against actual dealer costs from resolved vehicles
 */
export function detectLeaks(
  response: string,
  resolvedVehicles: Map<string, ResolvedVehicle>,
): LeakDetectionResult {
  const issues: LeakIssue[] = [];

  // Layer 1: Regex patterns
  for (const { pattern, label } of LEAK_PATTERNS) {
    const match = response.match(pattern);
    if (match) {
      issues.push({
        pattern: label,
        matched: match[0],
        severity: "critical",
      });
    }
  }

  // Layer 2: Check if any mentioned dollar amount matches a dealer cost
  if (resolvedVehicles.size > 0) {
    const prices = extractPrices(response);

    for (const [, vehicle] of resolvedVehicles) {
      const dealerCost = Number(vehicle.dealerCost);
      if (dealerCost <= 0) continue;

      for (const price of prices) {
        // Within $100 tolerance — very likely a dealer cost leak
        if (Math.abs(price.value - dealerCost) <= 100 && price.value > 10000) {
          issues.push({
            pattern: "dealer_cost_amount",
            matched: `$${price.value.toLocaleString("en-CA")} matches ${vehicle.make} ${vehicle.model} dealer cost`,
            severity: "critical",
          });
        }
      }
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}
