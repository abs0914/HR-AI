// node --experimental-strip-types scripts/check-rate-limit.mjs
import { strict as assert } from "node:assert";
import { rateLimit } from "../src/lib/rate-limit.ts";

// under the limit: allowed
for (let i = 0; i < 5; i++) assert.equal(rateLimit("u1", 5, 60_000).allowed, true);
// 6th call in window: blocked, with a sane retry hint
const blocked = rateLimit("u1", 5, 60_000);
assert.equal(blocked.allowed, false);
assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 60);
// other keys unaffected
assert.equal(rateLimit("u2", 5, 60_000).allowed, true);

console.log("rate limit checks passed");
