// node --experimental-strip-types scripts/check-billing.mjs
import { strict as assert } from "node:assert";
import crypto from "node:crypto";
import { verifyPayMongoSignature, effectivePlan } from "../src/lib/billing.ts";

const secret = "whsk_test_secret";
const body = JSON.stringify({ data: { attributes: { type: "checkout_session.payment.paid" } } });
const t = "1700000000";
const mac = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

// valid signatures accepted (test + live slots)
assert.equal(verifyPayMongoSignature(body, `t=${t},te=${mac}`, secret), true);
assert.equal(verifyPayMongoSignature(body, `t=${t},li=${mac}`, secret), true);
// tampered body, wrong secret, missing header: rejected
assert.equal(verifyPayMongoSignature(body + " ", `t=${t},te=${mac}`, secret), false);
assert.equal(verifyPayMongoSignature(body, `t=${t},te=${mac}`, "other"), false);
assert.equal(verifyPayMongoSignature(body, null, secret), false);
assert.equal(verifyPayMongoSignature(body, `t=${t},te=nothex`, secret), false);

// plan expiry lapses to free
assert.equal(effectivePlan({ plan: "premium", plan_expires_at: new Date(Date.now() - 1000).toISOString() }), "free");
assert.equal(effectivePlan({ plan: "premium", plan_expires_at: new Date(Date.now() + 86400000).toISOString() }), "premium");
assert.equal(effectivePlan({ plan: "premium", plan_expires_at: null }), "premium");
assert.equal(effectivePlan({ plan: "free" }), "free");

console.log("billing checks passed");
