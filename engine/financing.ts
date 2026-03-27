import type { EMIResult, FinancingOption } from "@/types";

const DEFAULT_CANADIAN_RATE = 6.99;

/**
 * Calculate equated monthly installment (EMI).
 * Standard amortization formula.
 */
export function calculateEMI(
  principal: number,
  annualRate: number,
  tenureMonths: number,
): EMIResult {
  if (principal <= 0 || tenureMonths <= 0) {
    return {
      emi: 0,
      totalPayment: 0,
      totalInterest: 0,
      principal,
      annualRate,
      tenureMonths,
    };
  }

  // Handle 0% financing
  if (annualRate === 0) {
    const emi = Math.round(principal / tenureMonths);
    return {
      emi,
      totalPayment: emi * tenureMonths,
      totalInterest: 0,
      principal,
      annualRate,
      tenureMonths,
    };
  }

  const monthlyRate = annualRate / 12 / 100;
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  const emi = (principal * monthlyRate * factor) / (factor - 1);

  const roundedEMI = Math.round(emi);
  const totalPayment = roundedEMI * tenureMonths;
  const totalInterest = totalPayment - principal;

  return {
    emi: roundedEMI,
    totalPayment,
    totalInterest,
    principal,
    annualRate,
    tenureMonths,
  };
}

/**
 * Generate multiple financing scenarios for 3-7 year terms.
 * Uses promotional rate if available, otherwise standard Canadian auto loan rate.
 */
export function generateFinancingOptions(
  vehiclePrice: number,
  downPayment: number,
  promotionalRate?: number | null,
): FinancingOption[] {
  const principal = Math.max(0, vehiclePrice - downPayment);
  const rate = promotionalRate ?? DEFAULT_CANADIAN_RATE;

  const tenures = [
    { months: 36, label: "3 years" },
    { months: 48, label: "4 years" },
    { months: 60, label: "5 years" },
    { months: 72, label: "6 years" },
    { months: 84, label: "7 years" },
  ];

  return tenures.map(({ months, label }) => ({
    tenure: months,
    label,
    ...calculateEMI(principal, rate, months),
  }));
}
