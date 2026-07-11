// node --experimental-strip-types scripts/check-billing-plans.mjs
import { strict as assert } from "node:assert";
import {
  checkoutAmountCentavos,
  createBillingReference,
  effectivePlan,
  isValidKawaniReference,
  validateEmployeeCountForPlan,
} from "../src/lib/billing.ts";

assert.equal(effectivePlan({ plan: "premium" }), "business");
assert.equal(effectivePlan({ plan: "core", paid_until: "2000-01-01T00:00:00Z" }), "free");
assert.equal(effectivePlan({ plan: "pro", paid_until: "2999-01-01T00:00:00Z" }), "pro");

assert.equal(validateEmployeeCountForPlan("core", 9).ok, false);
assert.equal(validateEmployeeCountForPlan("core", 10).ok, true);
assert.equal(validateEmployeeCountForPlan("core", 50).ok, true);
assert.equal(validateEmployeeCountForPlan("core", 51).ok, false);
assert.equal(validateEmployeeCountForPlan("business", 51).ok, true);
assert.equal(validateEmployeeCountForPlan("business", 151).ok, false);
assert.equal(validateEmployeeCountForPlan("pro", 151).ok, true);
assert.equal(validateEmployeeCountForPlan("enterprise", 500).ok, false);

assert.equal(checkoutAmountCentavos("core", 10), 100_000);
assert.equal(checkoutAmountCentavos("business", 51), 459_000);
assert.equal(checkoutAmountCentavos("pro", 151), 1_208_000);

const ref = createBillingReference("company-1", "business", 1783560000000);
assert.equal(ref, "kawaniai_company-1_business_1783560000");
assert.equal(isValidKawaniReference(ref, "company-1", "business"), true);
assert.equal(isValidKawaniReference("other_company-1_business_1", "company-1", "business"), false);

console.log("billing plan checks passed");
