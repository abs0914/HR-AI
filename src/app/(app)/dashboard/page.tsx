import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { seedDemoData } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { Card, CardContent, PageHeader, Button } from "@/components/ui";
import { Bot, Users, Clock, UserX, CalendarDays, Calculator, FolderOpen, UserCheck, CheckSquare, FileText, BellRing, Sparkles, ArrowRight } from "lucide-react";

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
    { label: "Active Employees", value: active.length, icon: Users, href: "/employees", tint: "text-teal-600 bg-teal-100/70" },
    { label: "Late Today", value: lateToday, icon: Clock, href: "/attendance", tint: "text-amber-600 bg-amber-100/70" },
    { label: "Absent Today", value: absentToday, icon: UserX, href: "/attendance", tint: "text-rose-600 bg-rose-100/70" },
    { label: "Pending Leaves", value: leaves.data?.length ?? 0, icon: CalendarDays, href: "/leave", tint: "text-sky-600 bg-sky-100/70" },
    { label: "Payroll Cutoff", value: period ? `${period.status}`.replace("_", " ") : "none", icon: Calculator, href: "/payroll", text: true, tint: "text-emerald-600 bg-emerald-100/70" },
    { label: "Missing Documents", value: missingDocs, icon: FolderOpen, href: "/documents", tint: "text-blue-600 bg-blue-100/70" },
    { label: "Regularization Due", value: regDue, icon: UserCheck, href: "/compliance", tint: "text-fuchsia-600 bg-fuchsia-100/70" },
    { label: "Pending AI Approvals", value: approvals.data?.length ?? 0, icon: CheckSquare, href: "/approvals", tint: "text-violet-600 bg-violet-100/70" },
    { label: "AI Files This Month", value: docsThisMonth.data?.length ?? 0, icon: FileText, href: "/documents", tint: "text-indigo-600 bg-indigo-100/70" },
    { label: "Compliance Reminders", value: reminders.data?.length ?? 0, icon: BellRing, href: "/compliance", tint: "text-cyan-600 bg-cyan-100/70" },
  ];

  return (
    <>
      <PageHeader title={`Hello, ${session.email.split("@")[0].split(/[._]/)[0].replace(/^./, (c) => c.toUpperCase())}`} subtitle={new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "full" })} />

      {active.length === 0 && session.role === "owner" && (
        <Card className="mb-4 rise-in">
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* bento hero — AI console */}
        <Link href="/console" className="col-span-2 sm:row-span-2">
          <div className="lift glass-card relative flex h-full flex-col justify-between overflow-hidden rounded-3xl p-5">
            <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-gradient-to-br from-teal-300/40 to-violet-300/40 blur-2xl" />
            <div className="relative">
              <span className="orb mb-4 flex h-14 w-14 items-center justify-center">
                <Bot size={26} className="relative z-10 text-white drop-shadow" />
              </span>
              <h2 className="text-lg font-bold text-gray-900">Ask Kawani AI</h2>
              <p className="mt-1 text-sm text-gray-500">Your AI HR officer — generate documents, query records, and prepare reports by chat, voice, or file.</p>
            </div>
            <div className="relative mt-4 flex flex-wrap gap-1.5">
              {["Who was late today?", "Generate a COE", "Payroll summary"].map((q) => (
                <span key={q} className="flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                  <Sparkles size={11} className="text-teal-500" /> {q}
                </span>
              ))}
              <span className="ml-auto flex items-center gap-1 text-sm font-semibold text-teal-700">Open <ArrowRight size={15} /></span>
            </div>
          </div>
        </Link>

        {cards.map((c) => (
          <Link key={c.label} href={c.href}>
            <div className="lift glass-card flex h-full flex-col gap-2 rounded-3xl p-4">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.tint}`}>
                <c.icon size={18} />
              </span>
              <p className={c.text ? "mt-1 text-base font-bold capitalize text-gray-900" : "mt-1 text-3xl font-bold tracking-tight text-gray-900"}>{c.value}</p>
              <p className="text-xs text-gray-500">{c.label}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
