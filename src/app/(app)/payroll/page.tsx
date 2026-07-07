import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { createPayrollPeriod, approvePayrollPeriod, updatePayrollItem } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Table, Th, Td, Badge, Button, EmptyState, Input, Label, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const session = await requireSession();
  if (!can(session.role, "payroll.read")) redirect("/dashboard");
  const { period: selectedId } = await searchParams;
  const supabase = await createClient();

  const { data: periods } = await supabase.from("payroll_periods")
    .select("*").eq("company_id", session.companyId).order("created_at", { ascending: false }).limit(20);
  const selected = (periods ?? []).find((p) => p.id === selectedId) ?? periods?.[0];

  const { data: items } = selected
    ? await supabase.from("payroll_items")
        .select("*, employees(first_name, last_name, employee_number, salary_type, salary_amount)")
        .eq("payroll_period_id", selected.id)
    : { data: [] };

  // simple 13th month estimate: monthly base / 12 per month of service this year
  const { data: emps } = await supabase.from("employees")
    .select("first_name, last_name, salary_amount, salary_type, hire_date, employment_status")
    .eq("company_id", session.companyId)
    .not("employment_status", "in", "(resigned,terminated,inactive,applicant)");
  const year = new Date().getFullYear();
  const thirteenth = (emps ?? [])
    .filter((e) => e.salary_amount && e.salary_type === "monthly")
    .map((e) => {
      const start = e.hire_date && new Date(e.hire_date).getFullYear() === year ? new Date(e.hire_date).getMonth() : 0;
      const months = Math.max(0, new Date().getMonth() + 1 - start);
      return { name: `${e.first_name} ${e.last_name}`, estimate: (Number(e.salary_amount) / 12) * months };
    });

  const canApprove = ["owner", "hr_admin"].includes(session.role);

  return (
    <>
      <PageHeader title="Payroll Preparation" subtitle="Attendance-based payroll prep — not full payroll processing. Exports require an approved period." />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>New payroll period</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={createPayrollPeriod} className="space-y-3">
              <div><Label>Name</Label><Input name="name" placeholder="July 1-15 cutoff" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Start</Label><Input type="date" name="start_date" required /></div>
                <div><Label>End</Label><Input type="date" name="end_date" required /></div>
              </div>
              <Button type="submit">Create from attendance</Button>
            </ActionForm>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Periods</CardTitle></CardHeader>
          <CardContent>
            {!periods?.length ? <p className="text-sm text-gray-400">No payroll periods yet.</p> : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {periods.map((p) => (
                  <div key={p.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${p.id === selected?.id ? "border-primary bg-emerald-50/40" : "border-line"}`}>
                    <a href={`/payroll?period=${p.id}`} className="text-sm font-medium text-gray-800 hover:text-primary">
                      {p.name} <span className="text-xs text-gray-400">({p.start_date} → {p.end_date})</span>
                    </a>
                    <span className="flex items-center gap-2">
                      <Badge status={p.status}>{p.status.replace("_", " ")}</Badge>
                      {p.status === "draft" && canApprove && (
                        <ActionForm action={approvePayrollPeriod} className="inline">
                          <input type="hidden" name="id" value={p.id} />
                          <Button type="submit" size="sm" variant="outline">Approve</Button>
                        </ActionForm>
                      )}
                      {p.status !== "draft" && (
                        <>
                          <a href={`/api/export/payroll/${p.id}?fmt=xlsx`} className="text-xs text-primary hover:underline">XLSX</a>
                          <a href={`/api/export/payroll/${p.id}?fmt=csv`} className="text-xs text-primary hover:underline">CSV</a>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selected && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Line items — {selected.name}</h2>
          {!items?.length ? <EmptyState title="No line items" hint="No attendance records fell within this period." /> : (
            <Table>
              <thead>
                <tr><Th>Employee</Th><Th>Days</Th><Th>Abs</Th><Th>Late</Th><Th>UT</Th><Th>OT</Th><Th>Allowances</Th><Th>Deductions</Th><Th>Advances</Th>{selected.status === "draft" && <Th />}</tr>
              </thead>
              <tbody>
                {items.map((i: any) => (
                  <tr key={i.id}>
                    <Td className="font-medium">{i.employees?.first_name} {i.employees?.last_name}</Td>
                    <Td>{i.days_worked}</Td><Td>{i.absences}</Td>
                    <Td>{i.late_minutes}m</Td><Td>{i.undertime_minutes}m</Td><Td>{i.overtime_minutes}m</Td>
                    {selected.status === "draft" ? (
                      <Td colSpan={4}>
                        <ActionForm action={updatePayrollItem} className="flex items-center gap-1.5" resetOnSuccess={false}>
                          <input type="hidden" name="id" value={i.id} />
                          <Input name="allowances" type="number" step="0.01" defaultValue={i.allowances} className="w-24" placeholder="Allow." />
                          <Input name="deductions" type="number" step="0.01" defaultValue={i.deductions} className="w-24" placeholder="Deduct." />
                          <Input name="cash_advances" type="number" step="0.01" defaultValue={i.cash_advances} className="w-24" placeholder="CA" />
                          <Input name="notes" defaultValue={i.notes ?? ""} className="w-32" placeholder="Notes" />
                          <Button type="submit" size="sm" variant="outline">Save</Button>
                        </ActionForm>
                      </Td>
                    ) : (
                      <>
                        <Td>₱{Number(i.allowances).toLocaleString()}</Td>
                        <Td>₱{Number(i.deductions).toLocaleString()}</Td>
                        <Td>₱{Number(i.cash_advances).toLocaleString()}</Td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}

      <h2 className="mb-2 mt-8 text-sm font-semibold text-gray-900">13th month estimate ({year}, year-to-date)</h2>
      {!thirteenth.length ? <EmptyState title="No monthly-salaried employees" hint="13th month estimates use monthly base salaries." /> : (
        <Table>
          <thead><tr><Th>Employee</Th><Th>Estimated accrual</Th></tr></thead>
          <tbody>
            {thirteenth.map((t) => (
              <tr key={t.name}>
                <Td>{t.name}</Td>
                <Td>₱{t.estimate.toLocaleString("en-PH", { maximumFractionDigits: 2 })}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-2 text-xs text-gray-400">Estimates only (base salary ÷ 12 × months of service this year). Verify against actual basic-salary earnings before December 24 (PD 851).</p>
    </>
  );
}
