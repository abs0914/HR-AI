import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can, employeeColumns } from "@/lib/rbac";
import { archiveEmployee } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Badge, Card, CardContent, CardHeader, CardTitle, Table, Th, Td, Button, EmptyState } from "@/components/ui";
import { EmployeeForm } from "@/components/employee-form";
import { logAudit } from "@/lib/audit";

const REQUIRED_DOCS = ["employment_contract", "data_privacy_consent", "government_id"];

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const supabase = await createClient();

  const { data: emp } = await supabase.from("employees")
    .select(`${employeeColumns(session.role)}, positions(title), departments(name), branches(name)`)
    .eq("id", id).maybeSingle();
  if (!emp) notFound();
  const e: any = emp;

  await logAudit({
    companyId: session.companyId, userId: session.userId, employeeId: id,
    module: "employees", action: "employee_file_viewed",
  });

  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [docs, leaves, balances, attendance, activity, options] = await Promise.all([
    supabase.from("employee_documents").select("id, title, document_type, status, generated_by_ai, created_at").eq("employee_id", id).order("created_at", { ascending: false }),
    supabase.from("leave_requests").select("leave_type, start_date, end_date, status").eq("employee_id", id).order("created_at", { ascending: false }).limit(5),
    supabase.from("leave_balances").select("leave_type, balance, used").eq("employee_id", id).eq("year", new Date().getFullYear()),
    supabase.from("attendance_records").select("status, late_minutes, undertime_minutes, overtime_minutes").eq("employee_id", id).gte("attendance_date", monthAgo),
    can(session.role, "audit.read")
      ? supabase.from("audit_logs").select("action, module, created_at").eq("employee_id", id).order("created_at", { ascending: false }).limit(8)
      : Promise.resolve({ data: [] }),
    Promise.all([
      supabase.from("branches").select("id, name").eq("company_id", session.companyId),
      supabase.from("departments").select("id, name").eq("company_id", session.companyId),
      supabase.from("positions").select("id, title").eq("company_id", session.companyId),
      supabase.from("employees").select("id, first_name, last_name").eq("company_id", session.companyId),
    ]),
  ]);

  const att = attendance.data ?? [];
  const attSummary = {
    present: att.filter((a) => ["present", "late", "undertime"].includes(a.status)).length,
    absent: att.filter((a) => a.status === "absent").length,
    lates: att.filter((a) => (a.late_minutes ?? 0) > 0).length,
    overtime: att.reduce((s, a) => s + (a.overtime_minutes ?? 0), 0),
  };
  const haveDocs = new Set((docs.data ?? []).map((d) => d.document_type));
  const canEdit = can(session.role, "employees.write");

  return (
    <>
      <PageHeader
        title={`${e.first_name} ${e.middle_name ? e.middle_name + " " : ""}${e.last_name}`}
        subtitle={`${e.positions?.title ?? "No position"} · ${e.branches?.name ?? "No branch"} · ${e.employee_number ?? "no employee #"}`}
      >
        <Badge status={e.employment_status}>{e.employment_status?.replace("_", " ")}</Badge>
        {session.role === "owner" && e.employment_status !== "inactive" && (
          <ActionForm action={archiveEmployee} confirmText="Archive this employee? Their status becomes inactive.">
            <input type="hidden" name="id" value={e.id} />
            <Button type="submit" variant="outline" size="sm">Archive</Button>
          </ActionForm>
        )}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle>Attendance (30 days)</CardTitle></CardHeader>
          <CardContent className="text-sm text-gray-600">
            {attSummary.present} present · {attSummary.absent} absent · {attSummary.lates} late(s) · {attSummary.overtime} OT min
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Leave balances</CardTitle></CardHeader>
          <CardContent className="text-sm text-gray-600">
            {(balances.data ?? []).length === 0 ? "No balances set" :
              balances.data!.map((b) => `${b.leave_type}: ${Number(b.balance) - Number(b.used)}/${b.balance}`).join(" · ")}
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Document checklist</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {REQUIRED_DOCS.map((t) => (
              <p key={t} className={haveDocs.has(t) ? "text-emerald-600" : "text-red-500"}>
                {haveDocs.has(t) ? "✓" : "✗"} {t.replace(/_/g, " ")}
              </p>
            ))}
          </CardContent></Card>
        <Card><CardHeader><CardTitle>Key dates</CardTitle></CardHeader>
          <CardContent className="text-sm text-gray-600">
            <p>Hired: {e.hire_date ?? "—"}</p>
            <p>Regularization: {e.regularization_date ?? "—"}</p>
            {e.separation_date && <p>Separated: {e.separation_date}</p>}
          </CardContent></Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Documents ({docs.data?.length ?? 0})</h2>
          {!docs.data?.length ? <EmptyState title="No documents yet" hint="Generate one via Kawani AI or upload from the Documents page." /> : (
            <Table>
              <thead><tr><Th>Title</Th><Th>Status</Th><Th>Download</Th></tr></thead>
              <tbody>
                {docs.data.map((d) => (
                  <tr key={d.id}>
                    <Td>{d.title}{d.generated_by_ai && <span className="ml-1 text-xs text-primary">AI</span>}</Td>
                    <Td><Badge status={d.status}>{d.status}</Badge></Td>
                    <Td>
                      <a className="text-primary hover:underline" href={`/api/documents/${d.id}/download?fmt=docx`}>DOCX</a>
                      <span className="mx-1 text-gray-300">|</span>
                      <a className="text-primary hover:underline" href={`/api/documents/${d.id}/download?fmt=pdf`}>PDF</a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Recent leave</h2>
          {!leaves.data?.length ? <EmptyState title="No leave history" /> : (
            <Table>
              <thead><tr><Th>Type</Th><Th>Dates</Th><Th>Status</Th></tr></thead>
              <tbody>
                {leaves.data.map((l, i) => (
                  <tr key={i}>
                    <Td className="capitalize">{l.leave_type.replace("_", " ")}</Td>
                    <Td>{l.start_date} → {l.end_date}</Td>
                    <Td><Badge status={l.status}>{l.status}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {(activity.data?.length ?? 0) > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-semibold text-gray-900">Activity history</h2>
              <div className="rounded-xl border border-line bg-white p-4">
                {activity.data!.map((a: any, i: number) => (
                  <p key={i} className="py-0.5 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">{a.action.replace(/_/g, " ")}</span> · {a.module} · {new Date(a.created_at).toLocaleString("en-PH")}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {canEdit && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Edit record</h2>
          <EmployeeForm
            employee={e}
            options={{
              branches: options[0].data ?? [], departments: options[1].data ?? [],
              positions: options[2].data ?? [], supervisors: options[3].data ?? [],
            }}
            showSalary={can(session.role, "employees.write_salary")}
          />
        </>
      )}
    </>
  );
}
