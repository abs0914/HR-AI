import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkoutAmountCentavos,
  isValidKawaniReference,
  subscriptionAccessUntil,
  validateEmployeeCountForPlan,
  verifyPayMongoSignature,
} from "@/lib/billing";
import { logAudit } from "@/lib/audit";

function eventResource(event: any) {
  return event?.data?.attributes?.data ?? {};
}

function eventAttrs(event: any) {
  return eventResource(event)?.attributes ?? {};
}

function subscriptionIdFromEvent(event: any): string | null {
  const resource = eventResource(event);
  const attrs = resource?.attributes ?? {};
  return (
    (resource?.type === "subscription" ? resource.id : null) ??
    attrs.subscription_id ??
    attrs.subscription?.id ??
    attrs.latest_invoice?.subscription_id ??
    attrs.invoice?.subscription_id ??
    attrs.billing?.subscription_id ??
    null
  );
}

async function touchGatewayWebhook(admin: ReturnType<typeof createAdminClient>) {
  await admin.from("payment_gateway_settings").upsert({
    provider: "paymongo",
    last_webhook_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider" });
}

async function activateSubscription(admin: ReturnType<typeof createAdminClient>, event: any, status = "active") {
  const subscriptionId = subscriptionIdFromEvent(event);
  if (!subscriptionId) return NextResponse.json({ error: "Missing subscription id" }, { status: 400 });

  const { data: localSub, error: subError } = await admin
    .from("paymongo_subscriptions")
    .select("*")
    .eq("paymongo_subscription_id", subscriptionId)
    .maybeSingle();
  if (subError) return NextResponse.json({ error: subError.message }, { status: 500 });
  if (!localSub) return NextResponse.json({ received: true, ignored: "unknown_subscription" });

  const attrs = eventAttrs(event);
  const paidUntil = subscriptionAccessUntil(attrs);
  const latestInvoiceId = attrs?.latest_invoice?.id ?? attrs?.invoice?.id ?? attrs?.id ?? null;
  const expectedAmount = Number(localSub.amount_centavos ?? 0);
  const paidAmount = Number(attrs?.latest_invoice?.amount ?? attrs?.amount ?? expectedAmount);
  if (expectedAmount > 0 && paidAmount && paidAmount !== expectedAmount) {
    return NextResponse.json({ error: "Subscription amount does not match the expected plan amount" }, { status: 400 });
  }

  await admin.from("paymongo_subscriptions").update({
    status,
    current_period_end: paidUntil,
    latest_invoice_id: latestInvoiceId,
    raw: attrs,
    updated_at: new Date().toISOString(),
  }).eq("paymongo_subscription_id", subscriptionId);

  const { error } = await admin.from("companies").update({
    plan: localSub.plan,
    pending_billing_plan: null,
    paid_until: paidUntil,
    plan_expires_at: paidUntil,
    billing_employee_count: localSub.employee_count,
    billing_reference: localSub.billing_reference,
    billing_status: "active",
    paymongo_customer_id: localSub.paymongo_customer_id,
    paymongo_subscription_id: subscriptionId,
    paymongo_plan_id: localSub.paymongo_plan_id,
    paymongo_subscription_status: status,
    subscription_current_period_end: paidUntil,
    updated_at: new Date().toISOString(),
  }).eq("id", localSub.company_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    companyId: localSub.company_id,
    module: "billing",
    action: "subscription_paid",
    details: {
      plan: localSub.plan,
      employee_count: localSub.employee_count,
      paid_until: paidUntil,
      subscription_id: subscriptionId,
      invoice_id: latestInvoiceId,
      amount_centavos: expectedAmount,
      status,
    },
  });
  return NextResponse.json({ received: true, subscription_id: subscriptionId, status, paid_until: paidUntil });
}

async function markSubscriptionProblem(
  admin: ReturnType<typeof createAdminClient>,
  event: any,
  billingStatus: "past_due" | "unpaid" | "cancelled" | "expired"
) {
  const subscriptionId = subscriptionIdFromEvent(event);
  if (!subscriptionId) return NextResponse.json({ received: true, ignored: "missing_subscription_id" });

  const { data: localSub, error: subError } = await admin
    .from("paymongo_subscriptions")
    .select("*")
    .eq("paymongo_subscription_id", subscriptionId)
    .maybeSingle();
  if (subError) return NextResponse.json({ error: subError.message }, { status: 500 });
  if (!localSub) return NextResponse.json({ received: true, ignored: "unknown_subscription" });

  const attrs = eventAttrs(event);
  const accessUntil = billingStatus === "past_due"
    ? (localSub.current_period_end ?? new Date().toISOString())
    : new Date().toISOString();

  await admin.from("paymongo_subscriptions").update({
    status: billingStatus,
    raw: attrs,
    updated_at: new Date().toISOString(),
  }).eq("paymongo_subscription_id", subscriptionId);

  const { error } = await admin.from("companies").update({
    plan: billingStatus === "past_due" ? localSub.plan : "free",
    billing_status: billingStatus,
    paid_until: accessUntil,
    plan_expires_at: accessUntil,
    paymongo_subscription_status: billingStatus,
    updated_at: new Date().toISOString(),
  }).eq("id", localSub.company_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit({
    companyId: localSub.company_id,
    module: "billing",
    action: `subscription_${billingStatus}`,
    details: { subscription_id: subscriptionId, plan: localSub.plan, employee_count: localSub.employee_count },
  });
  return NextResponse.json({ received: true, subscription_id: subscriptionId, status: billingStatus });
}

async function handleLegacyCheckoutPaid(admin: ReturnType<typeof createAdminClient>, event: any) {
  const checkoutData = eventResource(event);
  const sessionAttrs = checkoutData?.attributes;
  const metadata = sessionAttrs?.metadata ?? {};
  const companyId = metadata.company_id;
  const plan = metadata.plan;
  const employeeCount = Number(metadata.employee_count);
  const reference = metadata.reference;
  const valid = validateEmployeeCountForPlan(plan, employeeCount);
  if (!companyId || !valid.ok || !valid.plan) {
    return NextResponse.json({ error: "Missing or invalid company_id/plan/employee_count metadata" }, { status: 400 });
  }
  if (!isValidKawaniReference(reference, companyId, valid.plan)) {
    return NextResponse.json({ error: "Invalid Kawani AI billing reference" }, { status: 400 });
  }
  const expectedAmount = checkoutAmountCentavos(valid.plan, employeeCount);
  const paidAmount = Number(metadata.amount_centavos ?? sessionAttrs?.line_items?.[0]?.amount ?? sessionAttrs?.amount_total ?? expectedAmount);
  if (paidAmount !== expectedAmount) {
    return NextResponse.json({ error: "Payment amount does not match the expected plan amount" }, { status: 400 });
  }

  const paidUntil = new Date(Date.now() + 30 * 86400000).toISOString();
  const { error } = await admin.from("companies")
    .update({
      plan: valid.plan,
      plan_expires_at: paidUntil,
      paid_until: paidUntil,
      billing_employee_count: employeeCount,
      billing_reference: reference,
      billing_status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit({
    companyId, module: "billing", action: "payment_received",
    details: {
      plan: valid.plan, employee_count: employeeCount, paid_until: paidUntil,
      checkout_session_id: checkoutData?.id, reference, amount_centavos: expectedAmount,
    },
  });
  return NextResponse.json({ received: true, plan: valid.plan, employee_count: employeeCount, paid_until: paidUntil });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  if (!verifyPayMongoSignature(rawBody, req.headers.get("paymongo-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Bad payload" }, { status: 400 }); }

  const admin = createAdminClient();
  const { data: gateway } = await admin
    .from("payment_gateway_settings")
    .select("status")
    .eq("provider", "paymongo")
    .maybeSingle();
  if (gateway?.status && gateway.status !== "active") {
    return NextResponse.json({ error: "Payment gateway is not accepting webhooks" }, { status: 503 });
  }

  const type = event?.data?.attributes?.type;
  let response: NextResponse;
  if (type === "subscription.activated" || type === "subscription.invoice.paid" || (type === "payment.paid" && subscriptionIdFromEvent(event))) {
    response = await activateSubscription(admin, event);
  } else if (type === "subscription.unpaid") {
    response = await markSubscriptionProblem(admin, event, "unpaid");
  } else if (type === "subscription.cancelled") {
    response = await markSubscriptionProblem(admin, event, "cancelled");
  } else if (type === "subscription.past_due" || type === "payment.failed") {
    response = await markSubscriptionProblem(admin, event, "past_due");
  } else if (type === "checkout_session.payment.paid") {
    response = await handleLegacyCheckoutPaid(admin, event);
  } else {
    response = NextResponse.json({ received: true, ignored: type ?? "unknown" });
  }

  await touchGatewayWebhook(admin);
  return response;
}
