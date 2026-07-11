import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  checkoutAmountCentavos,
  createBillingReference,
  createCheckoutSession,
  createPayMongoCustomer,
  createPayMongoPlan,
  createPayMongoSubscription,
  hasPayMongo,
  subscriptionAccessUntil,
  validateEmployeeCountForPlan,
} from "@/lib/billing";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Only the Owner can manage billing." }, { status: 403 });
  }
  if (!hasPayMongo()) {
    return NextResponse.json({ error: "Billing is not configured (PAYMONGO_SECRET_KEY missing)." }, { status: 503 });
  }

  const planParam = req.nextUrl.searchParams.get("plan");
  const employeeCount = Number(req.nextUrl.searchParams.get("employee_count"));
  const valid = validateEmployeeCountForPlan(planParam, employeeCount);
  if (!valid.ok || !valid.plan) return NextResponse.json({ error: valid.message }, { status: 400 });

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name,paymongo_customer_id")
    .eq("id", session.companyId)
    .single();
  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;

  try {
    const admin = createAdminClient();
    const amountCentavos = checkoutAmountCentavos(valid.plan, employeeCount);
    let { data: localPlan } = await admin
      .from("paymongo_subscription_plans")
      .select("paymongo_plan_id")
      .eq("plan", valid.plan)
      .eq("employee_count", employeeCount)
      .maybeSingle();
    if (!localPlan?.paymongo_plan_id) {
      const createdPlan = await createPayMongoPlan({ plan: valid.plan, employeeCount });
      const { data: insertedPlan, error: planError } = await admin
        .from("paymongo_subscription_plans")
        .upsert({
          plan: valid.plan,
          employee_count: employeeCount,
          amount_centavos: createdPlan.amountCentavos,
          paymongo_plan_id: createdPlan.paymongoPlanId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "plan,employee_count" })
        .select("paymongo_plan_id")
        .single();
      if (planError) throw planError;
      localPlan = insertedPlan;
    }

    let customerId = company?.paymongo_customer_id;
    if (!customerId) {
      customerId = await createPayMongoCustomer({
        companyName: company?.name ?? "Kawani AI Workspace",
        ownerEmail: session.email,
      });
    }

    const reference = createBillingReference(session.companyId, valid.plan);
    let subscription;
    try {
      subscription = await createPayMongoSubscription({
        paymongoPlanId: localPlan.paymongo_plan_id,
        paymongoCustomerId: customerId,
      });
    } catch (err: any) {
      if (!String(err?.message ?? "").includes("payment_method_not_configured")) throw err;
      const checkout = await createCheckoutSession({
        companyId: session.companyId,
        companyName: company?.name ?? "your company",
        plan: valid.plan,
        employeeCount,
        successUrl: `${appUrl}/settings?billing=success`,
        cancelUrl: `${appUrl}/settings?billing=cancelled`,
      });
      await admin.from("companies").update({
        pending_billing_plan: valid.plan,
        billing_status: "checkout_pending",
        billing_employee_count: employeeCount,
        billing_reference: checkout.reference,
        paymongo_customer_id: customerId,
        paymongo_plan_id: localPlan.paymongo_plan_id,
        updated_at: new Date().toISOString(),
      }).eq("id", session.companyId);
      await logAudit({
        companyId: session.companyId, userId: session.userId,
        module: "billing", action: "subscription_unavailable_checkout_fallback",
        details: {
          plan: valid.plan,
          employee_count: employeeCount,
          session_id: checkout.sessionId,
          reference: checkout.reference,
          amount_centavos: checkout.amountCentavos,
          reason: "payment_method_not_configured",
        },
      });
      return NextResponse.redirect(checkout.checkoutUrl);
    }

    const activeNow = subscription.status === "active";
    const paidUntil = activeNow ? subscriptionAccessUntil(subscription.attrs) : null;
    await admin.from("paymongo_subscriptions").upsert({
      company_id: session.companyId,
      paymongo_subscription_id: subscription.subscriptionId,
      paymongo_customer_id: customerId,
      paymongo_plan_id: localPlan.paymongo_plan_id,
      plan: valid.plan,
      employee_count: employeeCount,
      amount_centavos: amountCentavos,
      billing_reference: reference,
      status: subscription.status,
      current_period_end: paidUntil,
      latest_invoice_id: subscription.attrs?.latest_invoice?.id ?? null,
      raw: subscription.attrs,
      updated_at: new Date().toISOString(),
    }, { onConflict: "paymongo_subscription_id" });

    await admin.from("companies").update({
      plan: activeNow ? valid.plan : "free",
      pending_billing_plan: activeNow ? null : valid.plan,
      billing_status: activeNow ? "active" : "subscription_pending",
      billing_employee_count: employeeCount,
      billing_reference: reference,
      paid_until: paidUntil,
      plan_expires_at: paidUntil,
      subscription_current_period_end: paidUntil,
      paymongo_customer_id: customerId,
      paymongo_subscription_id: subscription.subscriptionId,
      paymongo_plan_id: localPlan.paymongo_plan_id,
      paymongo_subscription_status: subscription.status,
      updated_at: new Date().toISOString(),
    }).eq("id", session.companyId);

    await logAudit({
      companyId: session.companyId, userId: session.userId,
      module: "billing", action: "subscription_started",
      details: {
        plan: valid.plan, employee_count: employeeCount,
        subscription_id: subscription.subscriptionId, customer_id: customerId,
        reference, amount_centavos: amountCentavos, status: subscription.status,
      },
    });
    if (activeNow) {
      return NextResponse.redirect(`${appUrl}/settings?billing=subscription_active`);
    }
    return NextResponse.redirect(subscription.actionUrl ?? `${appUrl}/settings?billing=subscription_pending`);
  } catch (e: any) {
    console.error("checkout error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
