import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession, hasPayMongo, PLAN_PRICES } from "@/lib/billing";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") {
    return NextResponse.json({ error: "Only the Owner can manage billing." }, { status: 403 });
  }
  if (!hasPayMongo()) {
    return NextResponse.json({ error: "Billing is not configured (PAYMONGO_SECRET_KEY missing)." }, { status: 503 });
  }
  const plan = req.nextUrl.searchParams.get("plan") ?? "premium";
  if (!PLAN_PRICES[plan]) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name").eq("id", session.companyId).single();
  const appUrl = process.env.APP_URL ?? req.nextUrl.origin;

  try {
    const { checkoutUrl, sessionId } = await createCheckoutSession({
      companyId: session.companyId,
      companyName: company?.name ?? "your company",
      plan: plan as "premium" | "enterprise",
      successUrl: `${appUrl}/settings?billing=success`,
      cancelUrl: `${appUrl}/settings?billing=cancelled`,
    });
    await logAudit({
      companyId: session.companyId, userId: session.userId,
      module: "billing", action: "checkout_started", details: { plan, session_id: sessionId },
    });
    return NextResponse.redirect(checkoutUrl);
  } catch (e: any) {
    console.error("checkout error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
