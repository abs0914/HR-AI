// ponytail: in-memory sliding window, per server instance. Fine for one Node
// process / small Vercel deployments; move to Upstash Redis when running many
// instances or needing exact global limits.

const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((hits[0] + windowMs - now) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  // opportunistic cleanup so the map doesn't grow unbounded
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.every((t) => t <= cutoff)) buckets.delete(k);
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export const LIMITS = {
  chat: { limit: 20, windowMs: 5 * 60_000 },       // 20 AI messages / 5 min / user
  transcribe: { limit: 20, windowMs: 5 * 60_000 }, // 20 voice clips / 5 min / user
  upload: { limit: 30, windowMs: 60 * 60_000 },    // 30 files / hour / user
} as const;
