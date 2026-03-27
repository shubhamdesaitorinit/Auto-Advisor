import { validateSpecs } from "./validators/spec-validator";
import { validatePrices } from "./validators/price-validator";
import { detectLeaks } from "./validators/leak-detector";
import { checkTone } from "./validators/tone-checker";
import { checkConsistency } from "./validators/consistency-checker";
import { resolveVehiclesInText, type ResolvedVehicle } from "./validators/shared";
import { FALLBACKS } from "./fallbacks";
import type { Offer } from "@/types";
import type { Logger } from "pino";

export interface ValidationCheck {
  name: string;
  passed: boolean;
  severity: "info" | "warning" | "critical";
  details: string;
  autoFixed?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  checks: ValidationCheck[];
  originalResponse: string;
  correctedResponse: string;
  blocked: boolean;
  blockReason?: string;
  processingTimeMs: number;
}

/**
 * Run all output validators on a response.
 *
 * Architecture:
 * - Single DB call resolves all mentioned vehicles (shared across validators)
 * - Pipeline short-circuits on CRITICAL block (leak → price → spec)
 * - Tone + consistency run regardless (fast, no DB)
 *
 * Order:
 * 1. Resolve vehicles (one DB query)
 * 2. Leak detector (regex + dealer cost matching — CRITICAL blocks)
 * 3. Price validator (margin floor check — CRITICAL blocks)
 * 4. Spec validator (auto-corrects, CRITICAL on unfixed safety specs)
 * 5. Consistency checker (offer price/discount matching — WARNING)
 * 6. Tone checker (pressure tactics — WARNING)
 */
export async function runOutputValidation(
  response: string,
  options: {
    activeOffers?: Record<string, Offer>;
    log?: Logger;
  } = {},
): Promise<ValidationResult> {
  const start = Date.now();
  const checks: ValidationCheck[] = [];
  let corrected = response;
  let blocked = false;
  let blockReason: string | undefined;
  const { log } = options;

  // ── Step 0: Resolve vehicles (single DB call shared by all validators) ──
  let resolved: Map<string, ResolvedVehicle> = new Map();
  try {
    resolved = await resolveVehiclesInText(response);
  } catch (err) {
    log?.error({ err }, "Vehicle resolution failed — validators will run without DB data");
  }

  // ── 1. Leak detector (fast, regex + cost matching) ─────────────
  try {
    const result = detectLeaks(response, resolved);
    if (!result.passed) {
      blocked = true;
      blockReason = FALLBACKS.data_leak;
      for (const issue of result.issues) {
        checks.push({
          name: "leak_detector",
          passed: false,
          severity: "critical",
          details: `${issue.pattern}: "${issue.matched}"`,
        });
      }
      return finalize(response, FALLBACKS.data_leak, checks, true, blockReason, start, log);
    }
    checks.push({ name: "leak_detector", passed: true, severity: "info", details: "Clean" });
  } catch (err) {
    log?.error({ err }, "Leak detector error");
    checks.push({ name: "leak_detector", passed: true, severity: "info", details: "Skipped (error)" });
  }

  // ── 2. Price validator (margin floor check) ────────────────────
  try {
    const result = validatePrices(response, resolved, options.activeOffers);
    const critical = result.checks.filter((c) => c.severity === "critical");
    if (critical.length > 0) {
      blocked = true;
      blockReason = FALLBACKS.price_violation;
      for (const c of critical) {
        checks.push({
          name: "price_validator",
          passed: false,
          severity: "critical",
          details: `${c.vehicleName}: $${c.mentionedPrice.toLocaleString("en-CA")} — ${c.context}`,
        });
      }
      return finalize(response, FALLBACKS.price_violation, checks, true, blockReason, start, log);
    }
    const warnings = result.checks.filter((c) => c.severity === "warning");
    for (const w of warnings) {
      checks.push({ name: "price_validator", passed: false, severity: "warning", details: w.context });
    }
    if (warnings.length === 0) {
      checks.push({ name: "price_validator", passed: true, severity: "info", details: `${result.checks.length} prices OK` });
    }
  } catch (err) {
    log?.error({ err }, "Price validator error");
    checks.push({ name: "price_validator", passed: true, severity: "info", details: "Skipped (error)" });
  }

  // ── 3. Spec validator (auto-corrects, blocks unfixed critical) ─
  try {
    const result = await validateSpecs(response, resolved);
    corrected = result.correctedResponse;

    const mismatches = result.checks.filter((c) => !c.matches);
    for (const m of mismatches) {
      checks.push({
        name: "spec_validator",
        passed: false,
        severity: m.severity,
        details: `${m.vehicleName} ${m.field}: ${m.claimedValue} → ${m.actualValue}`,
        autoFixed: m.autoFixed,
      });
    }

    const unfixedCritical = mismatches.filter((m) => m.severity === "critical" && !m.autoFixed);
    if (unfixedCritical.length > 0) {
      blocked = true;
      blockReason = FALLBACKS.spec_mismatch;
      return finalize(response, FALLBACKS.spec_mismatch, checks, true, blockReason, start, log);
    }

    if (mismatches.length === 0) {
      checks.push({ name: "spec_validator", passed: true, severity: "info", details: "Specs verified" });
    }
  } catch (err) {
    log?.error({ err }, "Spec validator error");
    checks.push({ name: "spec_validator", passed: true, severity: "info", details: "Skipped (error)" });
  }

  // ── 4. Consistency checker (fast, no DB) ───────────────────────
  try {
    const result = checkConsistency(corrected, options.activeOffers);
    for (const issue of result.issues) {
      checks.push({
        name: "consistency",
        passed: false,
        severity: issue.severity,
        details: issue.detail,
      });
    }
    if (result.issues.length === 0) {
      checks.push({ name: "consistency", passed: true, severity: "info", details: "Consistent" });
    }
  } catch {
    checks.push({ name: "consistency", passed: true, severity: "info", details: "Skipped (error)" });
  }

  // ── 5. Tone checker (fast, no DB) ──────────────────────────────
  try {
    const result = checkTone(corrected);
    for (const flag of result.flags) {
      checks.push({
        name: "tone",
        passed: false,
        severity: "warning",
        details: `${flag.label}: "${flag.matched}"`,
      });
    }
    if (result.flags.length === 0) {
      checks.push({ name: "tone", passed: true, severity: "info", details: "Tone OK" });
    }
  } catch {
    checks.push({ name: "tone", passed: true, severity: "info", details: "Skipped (error)" });
  }

  return finalize(response, corrected, checks, false, undefined, start, log);
}

// ── Helpers ──────────────────────────────────────────────────────

function finalize(
  original: string,
  corrected: string,
  checks: ValidationCheck[],
  blocked: boolean,
  blockReason: string | undefined,
  startTime: number,
  log?: Logger,
): ValidationResult {
  const processingTimeMs = Date.now() - startTime;
  const summary = {
    total: checks.length,
    passed: checks.filter((c) => c.passed).length,
    warnings: checks.filter((c) => c.severity === "warning" && !c.passed).length,
    critical: checks.filter((c) => c.severity === "critical" && !c.passed).length,
    autoFixed: checks.filter((c) => c.autoFixed).length,
  };

  const hasFixes = summary.autoFixed > 0;
  const status = blocked ? "BLOCKED" : hasFixes ? "CORRECTED" : "PASSED";

  if (log) {
    const level = blocked ? "warn" : hasFixes ? "info" : "debug";
    log[level]({ validation: summary, blocked, blockReason, processingTimeMs }, `Output validation: ${status}`);
  }

  return {
    valid: !blocked,
    checks,
    originalResponse: original,
    correctedResponse: blocked ? (blockReason ?? corrected) : corrected,
    blocked,
    blockReason,
    processingTimeMs,
  };
}
