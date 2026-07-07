import crypto from "crypto";

// PayMongo (GCash / Maya / cards — Philippine rails). Checkout Sessions API:
// https://developers.paymongo.com/reference/checkout-session-resource
// ponytail: single 30-day checkout payments, not the Subscriptions API —
// switch to real subscriptions when renewal churn becomes a problem.

export const PLAN_PRICES: Record<string, { amountCentavos: number; label: string }> = {
  premium: { amountCentavos: 1_499_00, label: "HR AI Premium — 30 days" },
  enterprise: { amountCentavos: 6_999_00, label: "HR AI Enterprise — 30 days" },
};

export const hasPayMongo = () => !!process.env.PAYMONGO_SECRET_KEY;

export async function createCheckoutSession(opts: {
  companyId: string;
  companyName: string;
  plan: "premium" | "enterprise";
  successUrl: string;
  cancelUrl: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const price = PLAN_PRICES[opts.plan];
  const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString("base64")}`,
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{
            name: price.label,
            amount: price.amountCentavos,
            currency: "PHP",
            quantity: 1,
          }],
          payment_method_types: ["gcash", "paymaya", "card"],
          description: `${price.label} for ${opts.companyName}`,
          success_url: opts.successUrl,
          cancel_url: opts.cancelUrl,
          metadata: { company_id: opts.companyId, plan: opts.plan },
        },
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`PayMongo checkout failed: ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
  }
  return { checkoutUrl: json.data.attributes.checkout_url, sessionId: json.data.id };
}

// Paymongo-Signature: t=<unix>,te=<hmac test mode>,li=<hmac live mode>
// HMAC-SHA256 over `${t}.${rawBody}` with the webhook secret.
export function verifyPayMongoSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const signature = parts.li || parts.te;
  if (!parts.t || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

// Paid plans lapse to free when expired.
export function effectivePlan(company: { plan?: string | null; plan_expires_at?: string | null }): "free" | "premium" | "enterprise" {
  const plan = (company.plan ?? "premium") as "free" | "premium" | "enterprise";
  if (plan === "free") return "free";
  if (company.plan_expires_at && new Date(company.plan_expires_at).getTime() < Date.now()) return "free";
  return plan;
}
