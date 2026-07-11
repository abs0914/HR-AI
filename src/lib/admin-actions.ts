"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import {
  normalizePlan,
  PLAN_CONFIG,
  SELF_SERVE_PLANS,
  validateEmployeeCountForPlan,
  type Plan,
} from "@/lib/billing";
import { logAudit } from "@/lib/audit";

type ActionResult = { ok: boolean; message: string };

const BILLING_STATUSES = new Set([
  "free", "checkout_pending", "subscription_pending", "active", "past_due",
  "unpaid", "expired", "cancelled", "custom",
]);
const API_STATUSES = new Set(["active", "paused", "revoked"]);
const GATEWAY_STATUSES = new Set(["active", "paused", "disabled"]);
const GATEWAY_MODES = new Set(["test", "live"]);

function text(fd: FormData, key: string) {
  const value = fd.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function intValue(fd: FormData, key: string) {
  const raw = text(fd, key);
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

function paidUntilFromDate(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59+08:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export async function updateSubscriberPlan(fd: FormData): Promise<ActionResult> {
  const adminUser = await requirePlatformAdmin();
  const companyId = text(fd, "company_id");
  const plan = normalizePlan(text(fd, "plan"));
  const billingStatus = text(fd, "billing_status") || (plan === "free" ? "free" : "active");
  const employeeCount = intValue(fd, "billing_employee_count");
  const paidUntil = paidUntilFromDate(text(fd, "paid_until"));
  const billingReference = text(fd, "billing_reference") || null;

  if (!companyId) return { ok: false, message: "Missing company." };
  if (!BILLING_STATUSES.has(billingStatus)) return { ok: false, message: "Invalid billing status." };
  if (Number.isNaN(employeeCount)) return { ok: false, message: "Employee count must be a whole number." };
  if (paidUntil === undefined) return { ok: false, message: "Invalid paid-until date." };

  if (SELF_SERVE_PLANS.includes(plan as any)) {
    const valid = validateEmployeeCountForPlan(plan, employeeCount);
    if (!valid.ok) return { ok: false, message: valid.message ?? "Invalid plan employee count." };
  }

  const update: Record<string, unknown> = {
    plan,
    billing_status: billingStatus,
    billing_employee_count: plan === "free" ? 0 : employeeCount,
    billing_reference: billingReference,
    paid_until: plan === "free" ? null : paidUntil,
    plan_expires_at: plan === "free" ? null : paidUntil,
    updated_at: new Date().toISOString(),
  };
  if (plan === "enterprise" && billingStatus === "custom") {
    update.paid_until = paidUntil;
    update.plan_expires_at = paidUntil;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("companies").update(update).eq("id", companyId);
  if (error) return { ok: false, message: error.message };

  await logAudit({
    companyId,
    userId: adminUser.userId,
    module: "platform_admin",
    action: "subscriber_plan_updated",
    details: { plan, billing_status: billingStatus, billing_employee_count: update.billing_employee_count, paid_until: update.paid_until },
  });
  revalidatePath("/admin");
  revalidatePath("/admin/subscribers");
  return { ok: true, message: `Updated subscriber to ${PLAN_CONFIG[plan].name}.` };
}

export async function updatePaymentGateway(fd: FormData): Promise<ActionResult> {
  const adminUser = await requirePlatformAdmin();
  const provider = text(fd, "provider") || "paymongo";
  const status = text(fd, "status");
  const mode = text(fd, "mode");
  const webhookUrl = text(fd, "webhook_url") || null;
  const notes = text(fd, "notes") || null;

  if (provider !== "paymongo") return { ok: false, message: "Only PayMongo is supported right now." };
  if (!GATEWAY_STATUSES.has(status)) return { ok: false, message: "Invalid gateway status." };
  if (!GATEWAY_MODES.has(mode)) return { ok: false, message: "Invalid gateway mode." };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("payment_gateway_settings")
    .upsert({
      provider,
      status,
      mode,
      webhook_url: webhookUrl,
      notes,
      updated_by: adminUser.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider" });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/admin");
  revalidatePath("/admin/payments");
  return { ok: true, message: "Payment gateway settings updated." };
}

export async function createApiSubscription(fd: FormData): Promise<ActionResult> {
  const adminUser = await requirePlatformAdmin();
  const companyId = text(fd, "company_id");
  const name = text(fd, "name");
  const monthlyQuota = intValue(fd, "monthly_quota_tokens");
  const allowedOrigins = text(fd, "allowed_origins") || null;
  const notes = text(fd, "notes") || null;

  if (!companyId || !name) return { ok: false, message: "Company and subscription name are required." };
  if (Number.isNaN(monthlyQuota)) return { ok: false, message: "Monthly quota must be a whole number." };

  const token = `kwapi_${crypto.randomBytes(24).toString("base64url")}`;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const tokenPrefix = token.slice(0, 18);
  const supabase = createAdminClient();
  const { error } = await supabase.from("api_subscriptions").insert({
    company_id: companyId,
    name,
    token_prefix: tokenPrefix,
    token_hash: tokenHash,
    status: "active",
    monthly_quota_tokens: monthlyQuota,
    allowed_origins: allowedOrigins,
    notes,
    created_by: adminUser.userId,
  });
  if (error) return { ok: false, message: error.message };

  await logAudit({
    companyId,
    userId: adminUser.userId,
    module: "platform_admin",
    action: "api_subscription_created",
    details: { name, token_prefix: tokenPrefix, monthly_quota_tokens: monthlyQuota },
  });
  revalidatePath("/admin/api-subscriptions");
  return { ok: true, message: `API subscription created. Token shown once: ${token}` };
}

export async function updateApiSubscription(fd: FormData): Promise<ActionResult> {
  const adminUser = await requirePlatformAdmin();
  const id = text(fd, "id");
  const companyId = text(fd, "company_id");
  const status = text(fd, "status");
  const monthlyQuota = intValue(fd, "monthly_quota_tokens");
  const allowedOrigins = text(fd, "allowed_origins") || null;
  const notes = text(fd, "notes") || null;

  if (!id || !companyId) return { ok: false, message: "Missing subscription." };
  if (!API_STATUSES.has(status)) return { ok: false, message: "Invalid subscription status." };
  if (Number.isNaN(monthlyQuota)) return { ok: false, message: "Monthly quota must be a whole number." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("api_subscriptions").update({
    status,
    monthly_quota_tokens: monthlyQuota,
    allowed_origins: allowedOrigins,
    notes,
    revoked_at: status === "revoked" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, message: error.message };

  await logAudit({
    companyId,
    userId: adminUser.userId,
    module: "platform_admin",
    action: "api_subscription_updated",
    details: { id, status, monthly_quota_tokens: monthlyQuota },
  });
  revalidatePath("/admin/api-subscriptions");
  return { ok: true, message: "API subscription updated." };
}

export async function resetApiSubscriptionUsage(fd: FormData): Promise<ActionResult> {
  const adminUser = await requirePlatformAdmin();
  const id = text(fd, "id");
  const companyId = text(fd, "company_id");
  if (!id || !companyId) return { ok: false, message: "Missing subscription." };

  const supabase = createAdminClient();
  const { error } = await supabase.from("api_subscriptions").update({
    used_tokens: 0,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, message: error.message };

  await logAudit({
    companyId,
    userId: adminUser.userId,
    module: "platform_admin",
    action: "api_subscription_usage_reset",
    details: { id },
  });
  revalidatePath("/admin/api-subscriptions");
  return { ok: true, message: "API usage reset." };
}

export async function revokeApiSubscription(fd: FormData): Promise<ActionResult> {
  fd.set("status", "revoked");
  return updateApiSubscription(fd);
}
