// node --experimental-strip-types scripts/check-finalpay.mjs
import { strict as assert } from "node:assert";
import { computeFinalPay, dailyRate, monthsWorkedThisYear } from "../src/lib/finalpay.ts";

// daily rate: 26,000/mo × 12 / 313 ≈ 996.80
assert.ok(Math.abs(dailyRate(26000) - 996.8) < 0.5, `dailyRate=${dailyRate(26000)}`);

// hired mid-year, separated end of year → ~6 months of service
const m = monthsWorkedThisYear("2026-07-01", "2026-12-31");
assert.ok(m >= 5.9 && m <= 6.1, `months=${m}`);

// full computation: monthly 26,000, 10 unpaid days, 5 leave days, hired this year 2026-07-01, sep 2026-12-31
const c = computeFinalPay({
  salaryType: "monthly", salaryAmount: 26000,
  daysWorked: 10, unusedLeaveDays: 5,
  hireDate: "2026-07-01", separationDate: "2026-12-31",
  cashAdvances: 2000, deductions: 500,
});
// last salary = 996.80 × 10 ≈ 9968; leave = 996.80 × 5 ≈ 4984
assert.ok(Math.abs(c.lastSalary - 9968) < 10, `lastSalary=${c.lastSalary}`);
assert.ok(Math.abs(c.leaveConversion - 4984) < 10, `leave=${c.leaveConversion}`);
// pro-rated 13th = 26000 × ~6 / 12 ≈ 13000
assert.ok(Math.abs(c.proRated13th - 13000) < 300, `13th=${c.proRated13th}`);
// net = gross - (500 + 2000)
assert.ok(Math.abs(c.net - (c.gross - 2500)) < 0.01, `net check`);
// net should be positive and internally consistent
assert.ok(c.gross > c.net && c.totalDeductions === 2500, `deductions=${c.totalDeductions}`);

// no salary → zero components, no crash
const z = computeFinalPay({ salaryType: "monthly", salaryAmount: 0, daysWorked: 5, unusedLeaveDays: 3, hireDate: null, separationDate: "2026-06-30" });
assert.equal(z.net, 0);

console.log("final pay checks passed");
