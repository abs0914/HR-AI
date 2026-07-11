import crypto from "crypto";

// PayMongo (GCash / Maya / cards — Philippine rails). Checkout Sessions API:
// https://developers.paymongo.com/reference/checkout-session-resource

export type Plan = "free" | "core" | "business" | "pro" | "enterprise";
export type PaidSelfServePlan = "core" | "business" | "pro";

export type PlanFeature =
  | "ai_hr_qa"
  | "policy_knowledge_base"
  | "data_lookup"
  | "document_generation"
  | "premium_document_generation"
  | "attendance_import"
  | "leave_workflows"
  | "payroll_summary"
  | "payroll_export"
  | "resume_analysis"
  | "compliance_dashboard"
  | "voice_input"
  | "priority_ai"
  | "advanced_audit"
  | "report_exports"
  | "agentic_workflows";

export type PlanConfig = {
  name: string;
  priceLabel: string;
  employeeRange: { min: number; max: number | null };
  branchLimit: number | null;
  perEmployeeAmountCentavos?: number;
  features: PlanFeature[];
};

export const PLAN_CONFIG: Record<Plan, PlanConfig> = {
  free: {
    name: "Free",
    priceLabel: "₱0/month",
    employeeRange: { min: 0, max: 3 },
    branchLimit: 1,
    features: ["ai_hr_qa", "policy_knowledge_base", "data_lookup"],
  },
  core: {
    name: "Core",
    priceLabel: "₱100/employee/month",
    employeeRange: { min: 10, max: 50 },
    branchLimit: 1,
    perEmployeeAmountCentavos: 100_00,
    features: [
      "ai_hr_qa", "policy_knowledge_base", "data_lookup", "document_generation",
      "attendance_import", "leave_workflows", "payroll_summary", "agentic_workflows",
    ],
  },
  business: {
    name: "Business",
    priceLabel: "₱90/employee/month",
    employeeRange: { min: 51, max: 150 },
    branchLimit: null,
    perEmployeeAmountCentavos: 90_00,
    features: [
      "ai_hr_qa", "policy_knowledge_base", "data_lookup", "document_generation",
      "premium_document_generation", "attendance_import", "leave_workflows",
      "payroll_summary", "payroll_export", "resume_analysis", "compliance_dashboard",
      "agentic_workflows",
    ],
  },
  pro: {
    name: "Pro",
    priceLabel: "₱80/employee/month",
    employeeRange: { min: 151, max: 300 },
    branchLimit: null,
    perEmployeeAmountCentavos: 80_00,
    features: [
      "ai_hr_qa", "policy_knowledge_base", "data_lookup", "document_generation",
      "premium_document_generation", "attendance_import", "leave_workflows",
      "payroll_summary", "payroll_export", "resume_analysis", "compliance_dashboard",
      "voice_input", "priority_ai", "advanced_audit", "report_exports",
      "agentic_workflows",
    ],
  },
  enterprise: {
    name: "Enterprise",
    priceLabel: "Custom pricing",
    employeeRange: { min: 0, max: null },
    branchLimit: null,
    features: [
      "ai_hr_qa", "policy_knowledge_base", "data_lookup", "document_generation",
      "premium_document_generation", "attendance_import", "leave_workflows",
      "payroll_summary", "payroll_export", "resume_analysis", "compliance_dashboard",
      "voice_input", "priority_ai", "advanced_audit", "report_exports",
      "agentic_workflows",
    ],
  },
};

export const SELF_SERVE_PLANS: PaidSelfServePlan[] = ["core", "business", "pro"];

// Kept as a simple map for older imports, now pointing at self-serve plans only.
export const PLAN_PRICES = Object.fromEntries(
  SELF_SERVE_PLANS.map((plan) => [
    plan,
    {
      amountCentavos: PLAN_CONFIG[plan].perEmployeeAmountCentavos!,
      label: `Kawani AI ${PLAN_CONFIG[plan].name} — monthly`,
    },
  ])
) as Record<PaidSelfServePlan, { amountCentavos: number; label: string }>;

export const hasPayMongo = () => !!process.env.PAYMONGO_SECRET_KEY;

function paymongoAuthHeader() {
  return `Basic ${Buffer.from(`${process.env.PAYMONGO_SECRET_KEY}:`).toString("base64")}`;
}

async function paymongoRequest(path: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.paymongo.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: paymongoAuthHeader(),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`PayMongo request failed: ${JSON.stringify(json.errors ?? json).slice(0, 500)}`);
  }
  return json;
}

export function normalizePlan(plan?: string | null): Plan {
  if (plan === "premium") return "business";
  if (plan === "free" || plan === "core" || plan === "business" || plan === "pro" || plan === "enterprise") return plan;
  return "free";
}

// Paid plans lapse to free when expired. paid_until is the new column; plan_expires_at
// is retained for older deployments/migrations.
export function effectivePlan(company: {
  plan?: string | null;
  paid_until?: string | null;
  plan_expires_at?: string | null;
}): Plan {
  const plan = normalizePlan(company.plan);
  if (plan === "free") return "free";
  const expires = company.paid_until ?? company.plan_expires_at;
  if (expires && new Date(expires).getTime() < Date.now()) return "free";
  return plan;
}

export function hasFeature(plan: Plan, feature: PlanFeature): boolean {
  return PLAN_CONFIG[plan].features.includes(feature);
}

export function validateEmployeeCountForPlan(plan: string | null, employeeCount: number): {
  ok: boolean;
  plan?: PaidSelfServePlan;
  message?: string;
} {
  if (!SELF_SERVE_PLANS.includes(plan as PaidSelfServePlan)) {
    return { ok: false, message: "Choose Core, Business, or Pro for self-serve checkout. Enterprise is custom pricing." };
  }
  if (!Number.isInteger(employeeCount) || employeeCount <= 0) {
    return { ok: false, message: "employee_count must be a positive whole number." };
  }
  const paidPlan = plan as PaidSelfServePlan;
  const range = PLAN_CONFIG[paidPlan].employeeRange;
  if (employeeCount < range.min || (range.max !== null && employeeCount > range.max)) {
    const max = range.max === null ? "+" : `-${range.max}`;
    return { ok: false, message: `${PLAN_CONFIG[paidPlan].name} is for ${range.min}${max} employees.` };
  }
  return { ok: true, plan: paidPlan };
}

export function checkoutAmountCentavos(plan: PaidSelfServePlan, employeeCount: number): number {
  return PLAN_CONFIG[plan].perEmployeeAmountCentavos! * employeeCount;
}

export function createBillingReference(companyId: string, plan: PaidSelfServePlan, now = Date.now()): string {
  return `kawaniai_${companyId}_${plan}_${Math.floor(now / 1000)}`;
}

export function isValidKawaniReference(reference: unknown, companyId: string, plan: string): reference is string {
  return typeof reference === "string" && reference.startsWith(`kawaniai_${companyId}_${plan}_`);
}

export async function createCheckoutSession(opts: {
  companyId: string;
  companyName: string;
  plan: PaidSelfServePlan;
  employeeCount: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ checkoutUrl: string; sessionId: string; reference: string; amountCentavos: number }> {
  const amount = checkoutAmountCentavos(opts.plan, opts.employeeCount);
  const reference = createBillingReference(opts.companyId, opts.plan);
  const label = `Kawani AI ${PLAN_CONFIG[opts.plan].name} — ${opts.employeeCount} employees`;
  const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: paymongoAuthHeader(),
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{
            name: label,
            amount,
            currency: "PHP",
            quantity: 1,
          }],
          payment_method_types: ["gcash", "paymaya", "card"],
          description: `kawaniai ${PLAN_CONFIG[opts.plan].name} subscription for ${opts.companyName}`,
          success_url: opts.successUrl,
          cancel_url: opts.cancelUrl,
          metadata: {
            reference,
            company_id: opts.companyId,
            plan: opts.plan,
            employee_count: String(opts.employeeCount),
            amount_centavos: String(amount),
          },
        },
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`PayMongo checkout failed: ${JSON.stringify(json.errors ?? json).slice(0, 300)}`);
  }
  return { checkoutUrl: json.data.attributes.checkout_url, sessionId: json.data.id, reference, amountCentavos: amount };
}

export async function createPayMongoPlan(opts: {
  plan: PaidSelfServePlan;
  employeeCount: number;
}): Promise<{ paymongoPlanId: string; amountCentavos: number }> {
  const amount = checkoutAmountCentavos(opts.plan, opts.employeeCount);
  const label = `Kawani AI ${PLAN_CONFIG[opts.plan].name} - ${opts.employeeCount} employees`;
  const json = await paymongoRequest("/v1/subscriptions/plans", {
    data: {
      attributes: {
        name: label,
        amount,
        currency: "PHP",
        interval: "monthly",
        interval_count: 1,
        description: `${label} monthly subscription`,
      },
    },
  });
  return { paymongoPlanId: json.data.id, amountCentavos: amount };
}

export async function createPayMongoCustomer(opts: {
  companyName: string;
  ownerEmail: string;
}): Promise<string> {
  const name = opts.companyName.trim() || "Kawani AI Customer";
  const json = await paymongoRequest("/v1/customers", {
    data: {
      attributes: {
        first_name: name.slice(0, 80),
        last_name: "Workspace",
        email: opts.ownerEmail,
      },
    },
  });
  return json.data.id;
}

export function paymongoDateToIso(date?: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T23:59:59+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function subscriptionAccessUntil(attrs: any): string {
  return (
    paymongoDateToIso(attrs?.next_billing_schedule) ??
    paymongoDateToIso(attrs?.latest_invoice?.due_date) ??
    new Date(Date.now() + 30 * 86400000).toISOString()
  );
}

export async function createPayMongoSubscription(opts: {
  paymongoPlanId: string;
  paymongoCustomerId: string;
}): Promise<{
  subscriptionId: string;
  status: string;
  actionUrl: string | null;
  attrs: any;
}> {
  const json = await paymongoRequest("/v1/subscriptions", {
    data: {
      attributes: {
        plan_id: opts.paymongoPlanId,
        customer_id: opts.paymongoCustomerId,
      },
    },
  });
  const attrs = json.data.attributes ?? {};
  const actionUrl =
    attrs.setup_intent?.next_action_url ??
    attrs.latest_invoice?.payment_intent?.next_action_url ??
    attrs.next_action_url ??
    null;
  return {
    subscriptionId: json.data.id,
    status: attrs.status ?? "incomplete",
    actionUrl,
    attrs,
  };
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
