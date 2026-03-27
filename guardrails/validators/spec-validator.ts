import { resolveVehiclesInText, type ResolvedVehicle } from "./shared";

export interface SpecCheck {
  vehicleName: string;
  field: string;
  claimedValue: string;
  actualValue: string;
  matches: boolean;
  severity: "info" | "warning" | "critical";
  autoFixed: boolean;
}

export interface SpecValidationResult {
  passed: boolean;
  checks: SpecCheck[];
  correctedResponse: string;
  /** Resolved vehicles — reusable by other validators to avoid duplicate DB calls. */
  resolvedVehicles: Map<string, ResolvedVehicle>;
}

// ── Spec extraction patterns ─────────────────────────────────────
// Each entry: regex, DB field name, tolerance, severity, unit label
type SpecRule = {
  pattern: RegExp;
  field: keyof ResolvedVehicle;
  tolerance: number;        // 0 = exact match required
  severity: "warning" | "critical";
  unit: string;
  parse: (match: string) => number;
  format: (actual: unknown) => string;
};

const SPEC_RULES: SpecRule[] = [
  {
    pattern: /(\d+\.?\d*)\s*L\/100\s*km/gi,
    field: "fuelEconomy",
    tolerance: 0.3,
    severity: "warning",
    unit: "L/100km",
    parse: (m) => parseFloat(m),
    format: (v) => String(parseFloat(String(v))),
  },
  {
    pattern: /(\d+\.?\d*)\s*kWh\/100\s*km/gi,
    field: "fuelEconomy",
    tolerance: 0.5,
    severity: "warning",
    unit: "kWh/100km",
    parse: (m) => parseFloat(m),
    format: (v) => String(parseFloat(String(v))),
  },
  {
    pattern: /(\d+)\s*(?:hp|horsepower|bhp)/gi,
    field: "horsepower",
    tolerance: 10,
    severity: "warning",
    unit: "hp",
    parse: (m) => parseInt(m),
    format: (v) => String(v),
  },
  {
    pattern: /(\d+)\s*(?:lb[- ]?ft|pound[- ]?feet)/gi,
    field: "torqueLbFt",
    tolerance: 10,
    severity: "warning",
    unit: "lb-ft",
    parse: (m) => parseInt(m),
    format: (v) => String(v),
  },
  {
    pattern: /(\d+)\s*airbags?/gi,
    field: "airbags",
    tolerance: 0,
    severity: "critical",
    unit: "airbags",
    parse: (m) => parseInt(m),
    format: (v) => String(v),
  },
  {
    pattern: /(\d+)[\s-]*(?:seater|seats?|passenger)/gi,
    field: "seating",
    tolerance: 0,
    severity: "critical",
    unit: "seats",
    parse: (m) => parseInt(m),
    format: (v) => String(v),
  },
  {
    pattern: /(\d+)\s*(?:litres?|liters?|L)\s*(?:of\s*)?cargo/gi,
    field: "cargoSpaceL",
    tolerance: 30,
    severity: "warning",
    unit: "L cargo",
    parse: (m) => parseInt(m),
    format: (v) => String(v),
  },
];

/**
 * Cross-reference vehicle specs in a response against the database.
 * Auto-corrects mismatches where possible. Uses a single DB query via resolveVehiclesInText.
 */
export async function validateSpecs(
  response: string,
  /** Pass pre-resolved vehicles to avoid duplicate DB calls. */
  preResolved?: Map<string, ResolvedVehicle>,
): Promise<SpecValidationResult> {
  const checks: SpecCheck[] = [];
  let corrected = response;

  let resolved: Map<string, ResolvedVehicle>;
  try {
    resolved = preResolved ?? await resolveVehiclesInText(response);
  } catch {
    return { passed: true, checks: [], correctedResponse: response, resolvedVehicles: new Map() };
  }

  if (resolved.size === 0) {
    return { passed: true, checks: [], correctedResponse: response, resolvedVehicles: resolved };
  }

  // For each resolved vehicle, find spec claims near its mention and validate
  for (const [, vehicle] of resolved) {
    const vehicleName = `${vehicle.make} ${vehicle.model}`;
    const namePatterns = [
      vehicleName.toLowerCase(),
      vehicle.model.toLowerCase(),
    ];

    // Find all positions where this vehicle is mentioned
    const lowerResp = response.toLowerCase();
    const positions: number[] = [];
    for (const pat of namePatterns) {
      let idx = lowerResp.indexOf(pat);
      while (idx !== -1) {
        positions.push(idx);
        idx = lowerResp.indexOf(pat, idx + pat.length);
      }
    }

    if (positions.length === 0) continue;

    // For each spec rule, check claims within context windows around vehicle mentions
    for (const rule of SPEC_RULES) {
      const actualRaw = vehicle[rule.field];
      if (actualRaw === null || actualRaw === undefined) continue;

      const actualValue = typeof actualRaw === "string" ? parseFloat(actualRaw) : Number(actualRaw);
      if (isNaN(actualValue)) continue;

      const actualFormatted = rule.format(actualRaw);

      // Search in a window around each vehicle mention
      for (const pos of positions) {
        const windowStart = Math.max(0, pos - 100);
        const windowEnd = Math.min(response.length, pos + vehicleName.length + 500);
        const window = response.slice(windowStart, windowEnd);

        const matches = [...window.matchAll(rule.pattern)];
        for (const m of matches) {
          const claimed = rule.parse(m[1]);
          if (isNaN(claimed)) continue;

          const diff = Math.abs(claimed - actualValue);
          if (diff <= rule.tolerance) continue; // within tolerance

          // Mismatch found
          const severity = rule.tolerance === 0
            ? rule.severity  // exact match rules keep their severity
            : diff > rule.tolerance * 3 ? "critical" : rule.severity;

          checks.push({
            vehicleName,
            field: String(rule.field),
            claimedValue: `${claimed} ${rule.unit}`,
            actualValue: `${actualFormatted} ${rule.unit}`,
            matches: false,
            severity,
            autoFixed: true,
          });

          // Auto-correct: replace claimed value with actual
          const escapedClaimed = String(claimed).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const unitPattern = rule.unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");
          corrected = corrected.replace(
            new RegExp(`${escapedClaimed}(\\s*${unitPattern})`, "i"),
            `${actualFormatted}$1`,
          );
        }
      }
    }
  }

  // ── Feature claim validation ──────────────────────────────────
  // Check if response claims features the vehicle doesn't have
  const FEATURE_PATTERNS: { pattern: RegExp; feature: string }[] = [
    { pattern: /panoramic\s*(?:sun)?roof/i, feature: "panoramic_sunroof" },
    { pattern: /sunroof/i, feature: "sunroof" },
    { pattern: /heated\s*(?:steering|wheel)/i, feature: "heated_steering_wheel" },
    { pattern: /heated\s*seats/i, feature: "heated_seats" },
    { pattern: /ventilated\s*seats/i, feature: "ventilated_seats" },
    { pattern: /remote\s*start/i, feature: "remote_start" },
    { pattern: /apple\s*carplay/i, feature: "apple_carplay" },
    { pattern: /android\s*auto/i, feature: "android_auto" },
    { pattern: /head[- ]?up\s*display/i, feature: "heads_up_display" },
    { pattern: /lane\s*(?:keep|departure)/i, feature: "lane_keep_assist" },
    { pattern: /blind\s*spot/i, feature: "blind_spot_monitoring" },
    { pattern: /adaptive\s*cruise/i, feature: "adaptive_cruise_control" },
    { pattern: /360\s*camera/i, feature: "360_camera" },
    { pattern: /wireless\s*charg/i, feature: "wireless_charging" },
  ];

  for (const [, vehicle] of resolved) {
    const vehicleName = `${vehicle.make} ${vehicle.model}`;
    const vehicleFeatures = (vehicle.features ?? []).map((f) => f.toLowerCase());
    const lowerResp = response.toLowerCase();

    // Only check features near this vehicle's mention
    const nameIdx = lowerResp.indexOf(vehicleName.toLowerCase());
    if (nameIdx === -1) continue;

    const featureWindow = response.slice(
      Math.max(0, nameIdx - 50),
      Math.min(response.length, nameIdx + vehicleName.length + 600),
    );

    for (const { pattern, feature } of FEATURE_PATTERNS) {
      if (pattern.test(featureWindow)) {
        // Check if the vehicle actually has this feature (or a variant of it)
        const hasFeature = vehicleFeatures.some(
          (f) => f.includes(feature) || feature.includes(f) || f.replace(/_/g, "").includes(feature.replace(/_/g, "")),
        );

        if (!hasFeature) {
          checks.push({
            vehicleName,
            field: "feature",
            claimedValue: feature.replace(/_/g, " "),
            actualValue: "not available",
            matches: false,
            severity: "warning",
            autoFixed: false,
          });
        }
      }
    }
  }

  // Deduplicate checks (same vehicle + field)
  const deduped = deduplicateChecks(checks);

  return {
    passed: !deduped.some((c) => !c.matches && c.severity === "critical" && !c.autoFixed),
    checks: deduped,
    correctedResponse: corrected,
    resolvedVehicles: resolved,
  };
}

function deduplicateChecks(checks: SpecCheck[]): SpecCheck[] {
  const seen = new Set<string>();
  return checks.filter((c) => {
    const key = `${c.vehicleName}:${c.field}:${c.claimedValue}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
