import { NextRequest, NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { rowsToCsv, rowsToXlsx } from "@/lib/docgen";
import { effectivePlan, hasFeature, PLAN_CONFIG } from "@/lib/billing";

export async function GET(req: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!can(session.role, "attendance.read_all")) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const start = req.nextUrl.searchParams.get("start") ?? new Date().toISOString().slice(0, 10);
  const end = req.nextUrl.searchParams.get("end") ?? start;
  const fmt = req.nextUrl.searchParams.get("fmt") === "csv" ? "csv" : "xlsx";

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("plan, paid_until, plan_expires_at").eq("id", session.companyId).single();
  const plan = effectivePlan(company ?? {});
  if (!hasFeature(plan, "report_exports")) {
    return NextResponse.json({ error: `${PLAN_CONFIG[plan].name} does not include report exports. Upgrade to Pro or Enterprise.` }, { status: 403 });
  }
  const { data: records } = await supabase.from("attendance_records")
    .select("*, employees(first_name, last_name, employee_number)")
    .eq("company_id", session.companyId)
    .gte("attendance_date", start).lte("attendance_date", end)
    .order("attendance_date");

  const rows = (records ?? []).map((r: any) => ({
    Date: r.attendance_date,
    "Employee #": r.employees?.employee_number ?? "",
    Employee: `${r.employees?.first_name} ${r.employees?.last_name}`,
    "Time In": r.time_in ? new Date(r.time_in).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" }) : "",
    "Time Out": r.time_out ? new Date(r.time_out).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" }) : "",
    "Break (min)": r.break_minutes, "Late (min)": r.late_minutes,
    "Undertime (min)": r.undertime_minutes, "Overtime (min)": r.overtime_minutes,
    Status: r.status, Source: r.source, Remarks: r.remarks ?? "",
  }));

  await logAudit({
    companyId: session.companyId, userId: session.userId,
    module: "attendance", action: "attendance_exported", details: { start, end, fmt, rows: rows.length },
  });

  const buf = fmt === "csv" ? rowsToCsv(rows) : rowsToXlsx(rows, "Attendance");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": fmt === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="attendance_${start}_${end}.${fmt}"`,
    },
  });
}
