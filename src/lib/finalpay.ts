// Philippine final pay (last pay) computation. Estimate only — the app requires
// human review/approval before release (DOLE Labor Advisory 06-20: release within 30 days).
// ponytail: transparent arithmetic, all components editable downstream; no tax/statutory
// withholding modelled — add BIR/SSS/PhilHealth/Pag-IBIG final deductions when payroll grows.

// Standard DOLE monthly-to-daily factor: 313 working days / 12 months (excludes 52 rest days).
const DAILY_FACTOR = 313 / 12; // ≈ 26.083

export function dailyRate(monthlyEquivalent: number): number {
  return (monthlyEquivalent * 12) / 313;
}

// Normalize any salary_type to a monthly-equivalent basic figure.
export function monthlyEquivalent(salaryType: string | null, amount: number): number {
  switch (salaryType) {
    case "daily": return amount * DAILY_FACTOR;
    case "hourly": return amount * 8 * DAILY_FACTOR;
    case "semi_monthly": return amount * 2;
    case "monthly":
    default: return amount;
  }
}

// Months of service within the current calendar year (for 13th-month proration).
export function monthsWorkedThisYear(hireDate: string | null, separationDate: string): number {
  const sep = new Date(separationDate);
  const yearStart = new Date(sep.getFullYear(), 0, 1);
  const start = hireDate && new Date(hireDate) > yearStart ? new Date(hireDate) : yearStart;
  if (sep <= start) return 0;
  const ms = sep.getTime() - start.getTime();
  const months = ms / (30.4375 * 86400000); // avg month length
  return Math.min(12, Math.round(months * 100) / 100);
}

export type FinalPayInput = {
  salaryType: string | null;
  salaryAmount: number;
  daysWorked: number;        // unpaid days worked in the final cutoff
  unusedLeaveDays: number;   // convertible leave credits (e.g. SIL/VL)
  hireDate: string | null;
  separationDate: string;
  allowances?: number;
  deductions?: number;
  cashAdvances?: number;
  otherLiabilities?: number;
};

export type FinalPayComponents = {
  lastSalary: number;
  proRated13th: number;
  leaveConversion: number;
  allowances: number;
  deductions: number;
  cashAdvances: number;
  otherLiabilities: number;
  gross: number;
  totalDeductions: number;
  net: number;
};

export function computeFinalPay(input: FinalPayInput): FinalPayComponents {
  const monthly = monthlyEquivalent(input.salaryType, input.salaryAmount || 0);
  const rate = dailyRate(monthly);
  const lastSalary = round2(rate * (input.daysWorked || 0));
  const months = monthsWorkedThisYear(input.hireDate, input.separationDate);
  const proRated13th = round2((monthly * months) / 12);
  const leaveConversion = round2(rate * (input.unusedLeaveDays || 0));
  const allowances = round2(input.allowances ?? 0);
  const deductions = round2(input.deductions ?? 0);
  const cashAdvances = round2(input.cashAdvances ?? 0);
  const otherLiabilities = round2(input.otherLiabilities ?? 0);

  const gross = round2(lastSalary + proRated13th + leaveConversion + allowances);
  const totalDeductions = round2(deductions + cashAdvances + otherLiabilities);
  return {
    lastSalary, proRated13th, leaveConversion, allowances,
    deductions, cashAdvances, otherLiabilities,
    gross, totalDeductions, net: round2(gross - totalDeductions),
  };
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export const php = (n: number) =>
  "PHP " + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
