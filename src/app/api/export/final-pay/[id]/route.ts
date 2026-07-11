import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { rowsToCsv, rowsToXlsx } from "@/lib/docgen";
import { effectivePlan, hasFeature, PLAN_CONFIG } from "@/lib/billing";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.role, "payroll.read")) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { id } = await params;
  const fmt = req.nextUrl.searchParams.get("fmt") === "csv" ? "csv" : "xlsx";
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("plan, paid_until, plan_expires_at").eq("id", session.companyId).single();
  const plan = effectivePlan(company ?? {});
  if (!hasFeature(plan, "report_exports")) {
    return NextResponse.json({ error: `${PLAN_CONFIG[plan].name} does not include report exports. Upgrade to Pro or Enterprise.` }, { status: 403 });
  }
  const { data: fp } = await supabase.from("final_pay")
    .select("*, employees(first_name, last_name, employee_number)")
    .eq("id", id).maybeSingle();
  if (!fp) return NextResponse.json({ error: "Final pay record not found" }, { status: 404 });
  if (fp.status === "draft") {
    return NextResponse.json({ error: "Approve the final pay before exporting." }, { status: 400 });
  }
  const emp: any = fp.employees;
  const rows = [{
    "Employee #": emp?.employee_number ?? "",
    Employee: `${emp?.first_name} ${emp?.last_name}`,
    "Separation Date": fp.separation_date,
    Reason: String(fp.reason).replace(/_/g, " "),
    "Unpaid Last Salary": fp.last_salary,
    "Pro-rated 13th Month": fp.pro_rated_13th,
    "Leave Conversion": fp.leave_conversion,
    Allowances: fp.allowances,
    "Gross Final Pay": Number(fp.last_salary) + Number(fp.pro_rated_13th) + Number(fp.leave_conversion) + Number(fp.allowances),
    Deductions: fp.deductions,
    "Cash Advances": fp.cash_advances,
    "Other Liabilities": fp.other_liabilities,
    "Net Final Pay": fp.net_final_pay,
    Status: fp.status,
    Notes: fp.notes ?? "",
  }];

  await logAudit({
    companyId: session.companyId, userId: session.userId, employeeId: fp.employee_id,
    module: "payroll", action: "final_pay_exported", details: { final_pay_id: id, fmt },
  });

  const buf = fmt === "csv" ? rowsToCsv(rows) : rowsToXlsx(rows, "Final Pay");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": fmt === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="final_pay_${(emp?.last_name ?? "employee").toLowerCase()}.${fmt}"`,
    },
  });
}
