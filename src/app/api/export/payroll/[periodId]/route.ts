import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { rowsToCsv, rowsToXlsx } from "@/lib/docgen";

export async function GET(req: NextRequest, { params }: { params: Promise<{ periodId: string }> }) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.role, "payroll.export") && !can(session.role, "payroll.write"))
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { periodId } = await params;
  const fmt = req.nextUrl.searchParams.get("fmt") === "csv" ? "csv" : "xlsx";
  const supabase = await createClient();
  const { data: period } = await supabase.from("payroll_periods").select("*").eq("id", periodId).maybeSingle();
  if (!period) return NextResponse.json({ error: "Period not found" }, { status: 404 });
  if (period.status === "draft") {
    return NextResponse.json({ error: "This payroll period must be approved before export (human approval required)." }, { status: 400 });
  }

  const { data: items } = await supabase.from("payroll_items")
    .select("*, employees(first_name, last_name, employee_number, salary_type, salary_amount)")
    .eq("payroll_period_id", periodId);
  const showSalary = can(session.role, "employees.read_salary") || session.role === "accountant";
  const rows = (items ?? []).map((i: any) => ({
    "Employee #": i.employees?.employee_number ?? "",
    Employee: `${i.employees?.first_name} ${i.employees?.last_name}`,
    "Days Worked": i.days_worked, Absences: i.absences,
    "Late (min)": i.late_minutes, "Undertime (min)": i.undertime_minutes,
    "Overtime (min)": i.overtime_minutes, Allowances: i.allowances,
    Deductions: i.deductions, "Cash Advances": i.cash_advances,
    ...(showSalary ? { "Salary Type": i.employees?.salary_type ?? "", "Base Salary": i.employees?.salary_amount ?? "" } : {}),
    Notes: i.notes ?? "",
  }));

  await logAudit({
    companyId: session.companyId, userId: session.userId,
    module: "payroll", action: "payroll_exported", details: { period_id: periodId, fmt },
  });

  const buf = fmt === "csv" ? rowsToCsv(rows) : rowsToXlsx(rows, "Payroll");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": fmt === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="payroll_${period.name.replace(/[^a-zA-Z0-9-]/g, "_")}.${fmt}"`,
    },
  });
}
