export interface ToneFlag {
  label: string;
  matched: string;
  severity: "warning";
}

export interface ToneCheckResult {
  passed: boolean;
  flags: ToneFlag[];
}

const PRESSURE_PATTERNS: { pattern: RegExp; label: string }[] = [
  // Artificial urgency
  { pattern: /(?:act|buy|decide|order)\s*(?:now|today|immediately|fast|quickly)/i, label: "artificial_urgency" },
  { pattern: /limited\s*(?:time|stock|availability)\s*(?:only|offer|deal)/i, label: "scarcity_pressure" },
  { pattern: /won'?t\s*last\s*(?:long|forever)/i, label: "scarcity_pressure" },
  { pattern: /before\s*(?:it'?s?\s*)?(?:too\s*late|gone|sold\s*out)/i, label: "fomo" },
  { pattern: /don'?t\s*miss\s*(?:out|this)/i, label: "fomo" },
  { pattern: /only\s*\d+\s*left/i, label: "scarcity_pressure" },

  // Manipulative framing
  { pattern: /you'?d\s*be\s*(?:crazy|foolish|stupid|mad)\s*(?:not\s*to|to\s*pass)/i, label: "shaming" },
  { pattern: /everybody\s*(?:is\s*)?(?:buying|getting|choosing)/i, label: "bandwagon" },
  { pattern: /you\s*(?:need|must|have\s*to)\s*(?:buy|get|grab)\s*this/i, label: "directive_pressure" },

  // Over-excitement
  { pattern: /!!{2,}/g, label: "excessive_exclamation" },
  { pattern: /(?:amazing|incredible|unbelievable|insane|crazy)\s*(?:deal|offer|price|value)/i, label: "hype_language" },
  { pattern: /once[\s-]*in[\s-]*a[\s-]*lifetime/i, label: "hype_language" },
  { pattern: /steal\s*(?:of\s*)?(?:a\s*)?deal/i, label: "hype_language" },
];

/**
 * Check response tone for high-pressure sales tactics.
 * WARNING severity — log but don't block.
 */
export function checkTone(response: string): ToneCheckResult {
  const flags: ToneFlag[] = [];

  for (const { pattern, label } of PRESSURE_PATTERNS) {
    const match = response.match(pattern);
    if (match) {
      flags.push({
        label,
        matched: match[0],
        severity: "warning",
      });
    }
  }

  return {
    passed: flags.length === 0,
    flags,
  };
}
