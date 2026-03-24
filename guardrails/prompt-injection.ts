import type { PromptInjectionResult } from "@/types";

const INJECTION_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /ignore\s+(previous|above|prior|all|my)\s+(instructions|prompts?|rules?)/i, label: "ignore_instructions" },
  { regex: /system\s*prompt/i, label: "system_prompt_probe" },
  { regex: /your\s+(instructions|rules|prompt|guidelines)/i, label: "instruction_probe" },
  { regex: /pretend\s+(you\s+are|to\s+be)/i, label: "role_override" },
  { regex: /act\s+as\s+(a|an|if)/i, label: "role_override" },
  { regex: /roleplay\s+as/i, label: "role_override" },
  { regex: /reveal\s+(cost|margin|price|markup)/i, label: "cost_probe" },
  { regex: /show\s+(me\s+)?(dealer\s+)?cost/i, label: "cost_probe" },
  { regex: /dealer\s+cost/i, label: "cost_probe" },
  { regex: /internal\s+pricing/i, label: "cost_probe" },
  { regex: /\bmarkup\b/i, label: "cost_probe" },
  { regex: /\bjailbreak\b/i, label: "jailbreak" },
  { regex: /\bDAN\b/, label: "jailbreak" },
  { regex: /bypass\s+(filter|restriction|safety|guardrail)/i, label: "bypass" },
  { regex: /do\s+anything\s+now/i, label: "jailbreak" },
  { regex: /disregard\s+(all|your|the)\s+(previous|prior|above)/i, label: "ignore_instructions" },
  { regex: /forget\s+(all|your|everything)\s+(previous|prior|instructions)/i, label: "ignore_instructions" },
];

export function detectPromptInjection(message: string): PromptInjectionResult {
  for (const { regex, label } of INJECTION_PATTERNS) {
    if (regex.test(message)) {
      return { detected: true, pattern: label };
    }
  }
  return { detected: false };
}
