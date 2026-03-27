export const FALLBACKS = {
  price_violation:
    "Let me double-check those numbers and get back to you with the accurate pricing.",
  spec_mismatch:
    "I want to make sure I give you the right specifications. Let me pull up the exact details.",
  data_leak:
    "Let me rephrase that for you with the relevant information.",
  general:
    "Give me just a moment to verify that information for you.",
} as const;

export type FallbackKey = keyof typeof FALLBACKS;
