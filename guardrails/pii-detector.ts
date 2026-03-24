import type { PIIDetectionResult } from "@/types";

interface PIIPattern {
  name: string;
  regex: RegExp;
  replacement: string;
}

const PII_PATTERNS: PIIPattern[] = [
  {
    name: "aadhaar",
    // Aadhaar: 12 digits, optionally grouped as 4-4-4 with spaces or hyphens
    regex: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4})\b/g,
    replacement: "[AADHAAR_REDACTED]",
  },
  {
    name: "pan",
    // PAN: 5 uppercase letters, 4 digits, 1 uppercase letter
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    replacement: "[PAN_REDACTED]",
  },
  {
    name: "credit_card",
    // Credit card: 13-19 digits, optionally separated by spaces or hyphens
    regex: /\b(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7})\b/g,
    replacement: "[CARD_REDACTED]",
  },
  {
    name: "phone",
    // Indian phone: optional +91 or 0, then 10 digits
    regex: /(?:\+91[\s-]?|0)?[6-9]\d{9}\b/g,
    replacement: "[PHONE_REDACTED]",
  },
  {
    name: "email",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[EMAIL_REDACTED]",
  },
];

export function detectPII(message: string): PIIDetectionResult {
  const typesFound: string[] = [];
  let masked = message;

  for (const { name, regex, replacement } of PII_PATTERNS) {
    // Reset lastIndex for global regexes
    regex.lastIndex = 0;
    if (regex.test(message)) {
      typesFound.push(name);
      regex.lastIndex = 0;
      masked = masked.replace(regex, replacement);
    }
  }

  return {
    found: typesFound.length > 0,
    types: typesFound,
    masked,
  };
}
