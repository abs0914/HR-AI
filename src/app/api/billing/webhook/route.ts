import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPayMongoSignature, PLAN_PRICES } from "@/lib/billing";
import { logAudit } from "@/lib/audit";

// PayMongo webhook — register the endpoint via their API/dashboard with the
// checkout_session.payment.paid event, then set PAYMONGO_WEBHOOK_SECRET.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  if (!verifyPayMongoSignature(rawBody, req.headers.get("paymongo-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Bad payload" }, { status: 400 }); }

  const type = event?.data?.attributes?.type;
  if (type !== "checkout_session.payment.paid") {
    return NextResponse.json({ received: true, ignored: type ?? "unknown" });
  }

  const sessionAttrs = event?.data?.attributes?.data?.attributes;
  const metadata = sessionAttrs?.metadata ?? {};
  const companyId = metadata.company_id;
  const plan = metadata.plan;
  if (!companyId || !PLAN_PRICES[plan]) {
    return NextResponse.json({ error: "Missing company_id/plan metadata" }, { status: 400 });
  }

  const admin = createAdminClient();
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  const { error } = await admin.from("companies")
    .update({ plan, plan_expires_at: expires, updated_at: new Date().toISOString() })
    .eq("id", companyId);
  if (error) {
    console.error("webhook plan update failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await logAudit({
    companyId, module: "billing", action: "payment_received",
    details: { plan, expires_at: expires, checkout_session_id: event?.data?.attributes?.data?.id },
  });
  return NextResponse.json({ received: true, plan, expires_at: expires });
}
