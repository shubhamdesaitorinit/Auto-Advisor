import type { PIIDetectionResult } from "@/types";

interface PIIPattern {
  name: string;
  regex: RegExp;
  replacement: string;
  /** If true, mask in logs but keep in clean message (user intentionally shared it). */
  contactInfo: boolean;
}

const PII_PATTERNS: PIIPattern[] = [
  // ── Sensitive IDs — always mask ────────────────────────────
  {
    name: "aadhaar",
    regex: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g,
    replacement: "[AADHAAR_REDACTED]",
    contactInfo: false,
  },
  {
    name: "pan",
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    replacement: "[PAN_REDACTED]",
    contactInfo: false,
  },
  {
    name: "credit_card",
    regex: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7})\b/g,
    replacement: "[CARD_REDACTED]",
    contactInfo: false,
  },
  // ── Contact info — detect but DON'T mask in clean message ──
  // Users intentionally share these for booking/lead capture.
  // We detect them for logging awareness but preserve them so
  // the lead capture agent can extract them later.
  {
    name: "phone",
    regex: /(?:\+91[\s-]?|0)?[6-9]\d{9}\b/g,
    replacement: "[PHONE_REDACTED]",
    contactInfo: true,
  },
  {
    name: "email",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[EMAIL_REDACTED]",
    contactInfo: true,
  },
];

export function detectPII(message: string): PIIDetectionResult {
  const typesFound: string[] = [];
  let masked = message;       // For logging only — sensitive IDs redacted
  const cleanMessage = message; // Preserved for the conversation — contact info kept

  for (const { name, regex, replacement, contactInfo } of PII_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(message)) {
      typesFound.push(name);
      regex.lastIndex = 0;
      // Always mask in the "masked" version (for logs)
      masked = masked.replace(regex, replacement);
      // But DON'T mask contact info in the clean version — the user shared it intentionally
      // Only mask sensitive IDs (Aadhaar, PAN, credit cards)
      if (!contactInfo) {
        // cleanMessage already equals message; sensitive IDs get masked here
        // (handled below)
      }
    }
  }

  // Build clean message: only mask sensitive IDs, keep contact info
  let clean = message;
  for (const { regex, replacement, contactInfo } of PII_PATTERNS) {
    if (!contactInfo) {
      regex.lastIndex = 0;
      clean = clean.replace(regex, replacement);
    }
  }

  return {
    found: typesFound.length > 0,
    types: typesFound,
    masked: masked, // All PII masked (for logging)
    clean,          // Only sensitive IDs masked (for conversation storage)
  };
}
