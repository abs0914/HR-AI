import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { seedDemoData } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, PageHeader, Button } from "@/components/ui";
import { Bot, Users, Clock, UserX, CalendarDays, Calculator, FolderOpen, UserCheck, CheckSquare, FileText, BellRing } from "lucide-react";

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const monthStart = today.slice(0, 8) + "01";

  const [emps, attToday, leaves, approvals, docsThisMonth, reminders, periods, docs] = await Promise.all([
    supabase.from("employees").select("id, employment_status, hire_date, regularization_date").eq("company_id", session.companyId),
    supabase.from("attendance_records").select("status").eq("company_id", session.companyId).eq("attendance_date", today),
    supabase.from("leave_requests").select("id").eq("company_id", session.companyId).eq("status", "pending"),
    supabase.from("ai_actions").select("id").eq("company_id", session.companyId).eq("status", "pending"),
    supabase.from("employee_documents").select("id").eq("company_id", session.companyId).eq("generated_by_ai", true).gte("created_at", monthStart),
    supabase.from("compliance_reminders").select("id").eq("company_id", session.companyId).eq("status", "open"),
    supabase.from("payroll_periods").select("name, status").eq("company_id", session.companyId).order("created_at", { ascending: false }).limit(1),
    supabase.from("employee_documents").select("employee_id, document_type").eq("company_id", session.companyId),
  ]);

  const active = (emps.data ?? []).filter((e) => !["resigned", "terminated", "inactive", "applicant"].includes(e.employment_status));
  const lateToday = (attToday.data ?? []).filter((a) => a.status === "late").length;
  const absentToday = (attToday.data ?? []).filter((a) => a.status === "absent").length;

  const horizon = Date.now() + 45 * 86400000;
  const regDue = active.filter((e) => {
    if (e.employment_status !== "probationary") return false;
    const reg = e.regularization_date
      ? new Date(e.regularization_date)
      : e.hire_date ? new Date(new Date(e.hire_date).setMonth(new Date(e.hire_date).getMonth() + 6)) : null;
    return reg !== null && reg.getTime() <= horizon;
  }).length;

  const have = new Set((docs.data ?? []).map((d) => `${d.employee_id}:${d.document_type}`));
  const missingDocs = active.filter((e) =>
    ["employment_contract", "data_privacy_consent"].some((t) => !have.has(`${e.id}:${t}`))
  ).length;

  const period = periods.data?.[0];
  const cards = [
    { label: "Active Employees", value: active.length, icon: Users, href: "/employees" },
    { label: "Late Today", value: lateToday, icon: Clock, href: "/attendance" },
    { label: "Absent Today", value: absentToday, icon: UserX, href: "/attendance" },
    { label: "Pending Leave Requests", value: leaves.data?.length ?? 0, icon: CalendarDays, href: "/leave" },
    { label: "Payroll Cutoff Status", value: period ? `${period.status}` : "none", icon: Calculator, href: "/payroll", text: true },
    { label: "Missing Employee Documents", value: missingDocs, icon: FolderOpen, href: "/documents" },
    { label: "Due for Regularization", value: regDue, icon: UserCheck, href: "/compliance" },
    { label: "Pending AI Approvals", value: approvals.data?.length ?? 0, icon: CheckSquare, href: "/approvals" },
    { label: "AI Files This Month", value: docsThisMonth.data?.length ?? 0, icon: FileText, href: "/documents" },
    { label: "Compliance Reminders", value: reminders.data?.length ?? 0, icon: BellRing, href: "/compliance" },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Overview for today, ${new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" })}`}>
        <Link href="/console">
          <Button><Bot size={15} /> Ask Kawani AI</Button>
        </Link>
      </PageHeader>

      {active.length === 0 && session.role === "owner" && (
        <Card className="mb-6 border-primary/40 bg-emerald-50/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">New workspace — load demo data?</p>
              <p className="text-xs text-gray-600">Adds 5 demo employees, attendance, leave requests, reminders, and documents so you can try Kawani AI right away.</p>
            </div>
            <ActionForm action={seedDemoData}>
              <Button type="submit" variant="accent">Load demo data</Button>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="pt-4">
                <c.icon size={18} className="mb-2 text-primary" />
                <p className={c.text ? "text-lg font-bold capitalize text-gray-900" : "text-2xl font-bold text-gray-900"}>{c.value}</p>
                <p className="mt-0.5 text-xs text-gray-500">{c.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <CardContent className="py-4">
          <p className="mb-2 text-sm font-semibold text-gray-900">Try asking Kawani AI</p>
          <div className="flex flex-wrap gap-2">
            {["Who was late today?", "Generate a COE for Juan Dela Cruz.", "Show employees due for regularization.", "Create a memo about attendance policy.", "Generate payroll summary for this cutoff."].map((q) => (
              <Link key={q} href={`/console?q=${encodeURIComponent(q)}`} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs text-gray-600 hover:border-primary hover:text-primary">
                {q}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
