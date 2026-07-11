import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { createReminder, updateReminderStatus } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Table, Th, Td, Badge, Button, EmptyState, Input, Label, Select, Textarea, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { effectivePlan, hasFeature, PLAN_CONFIG } from "@/lib/billing";

const TYPES = [
  "probationary_evaluation", "regularization_due", "contract_expiration", "missing_documents",
  "payroll_cutoff", "13th_month", "leave_balance_review", "policy_acknowledgment",
  "data_privacy_consent", "holiday", "government_contributions", "other",
];

export default async function CompliancePage() {
  const session = await requireSession();
  if (!can(session.role, "compliance.read")) redirect("/dashboard");
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("plan, paid_until, plan_expires_at").eq("id", session.companyId).single();
  const plan = effectivePlan(company ?? {});
  if (!hasFeature(plan, "compliance_dashboard")) {
    return (
      <>
        <PageHeader title="Compliance Reminders" subtitle="Available on Business, Pro, and Enterprise plans" />
        <EmptyState title="Upgrade required" hint={`${PLAN_CONFIG[plan].name} does not include the compliance dashboard.`} />
      </>
    );
  }
  const { data: reminders } = await supabase.from("compliance_reminders")
    .select("*, employees:related_employee_id(first_name, last_name)")
    .eq("company_id", session.companyId).order("due_date").limit(100);
  const canWrite = can(session.role, "compliance.write");
  const open = (reminders ?? []).filter((r) => r.status === "open");
  const closed = (reminders ?? []).filter((r) => r.status !== "open");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

  return (
    <>
      <PageHeader title="Compliance Reminders" subtitle="Template-based guidance for Philippine SMEs — not legal advice. Consult a qualified professional for final decisions." />

      {canWrite && (
        <Card className="mb-6">
          <CardHeader><CardTitle>New reminder</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={createReminder} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <div>
                <Label>Type</Label>
                <Select name="reminder_type">{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</Select>
              </div>
              <div className="col-span-2"><Label>Title</Label><Input name="title" required /></div>
              <div><Label>Due date</Label><Input type="date" name="due_date" required /></div>
              <div className="flex items-end"><Button type="submit">Add</Button></div>
              <div className="col-span-2 lg:col-span-5"><Label>Description</Label><Textarea name="description" rows={2} /></div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <h2 className="mb-2 text-sm font-semibold text-gray-900">Open ({open.length})</h2>
      {!open.length ? <EmptyState title="No open compliance reminders" /> : (
        <Table>
          <thead><tr><Th>Due</Th><Th>Type</Th><Th>Title</Th><Th>Employee</Th>{canWrite && <Th />}</tr></thead>
          <tbody>
            {open.map((r: any) => (
              <tr key={r.id} className={r.due_date && r.due_date < today ? "bg-red-50/50" : ""}>
                <Td className={r.due_date && r.due_date < today ? "font-semibold text-red-600" : ""}>{r.due_date ?? "—"}</Td>
                <Td className="capitalize">{r.reminder_type.replace(/_/g, " ")}</Td>
                <Td className="font-medium">{r.title}<p className="text-xs text-gray-400">{r.description ?? ""}</p></Td>
                <Td>{r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : "—"}</Td>
                {canWrite && (
                  <Td>
                    <span className="flex gap-1.5">
                      <ActionForm action={updateReminderStatus} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="done" />
                        <Button type="submit" size="sm" variant="outline">Done</Button>
                      </ActionForm>
                      <ActionForm action={updateReminderStatus} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="status" value="dismissed" />
                        <Button type="submit" size="sm" variant="ghost">Dismiss</Button>
                      </ActionForm>
                    </span>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold text-gray-900">Resolved</h2>
          <Table>
            <thead><tr><Th>Due</Th><Th>Title</Th><Th>Status</Th></tr></thead>
            <tbody>
              {closed.map((r: any) => (
                <tr key={r.id}>
                  <Td>{r.due_date ?? "—"}</Td>
                  <Td>{r.title}</Td>
                  <Td><Badge status={r.status}>{r.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </>
  );
}
