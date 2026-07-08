import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { createFinalPay, updateFinalPay, approveFinalPay, markFinalPayReleased, generateFinalPayDocument } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Table, Th, Td, Badge, Button, EmptyState, Input, Label, Select, Textarea, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

const REASONS = ["resignation", "end_of_contract", "termination", "retirement", "redundancy", "closure", "other"];
const peso = (n: number) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function FinalPayPage() {
  const session = await requireSession();
  if (!can(session.role, "payroll.read")) redirect("/dashboard");
  const supabase = await createClient();
  const canApprove = ["owner", "hr_admin"].includes(session.role);

  const [{ data: records }, { data: employees }] = await Promise.all([
    supabase.from("final_pay")
      .select("*, employees(first_name, last_name, employee_number)")
      .eq("company_id", session.companyId).order("created_at", { ascending: false }).limit(50),
    supabase.from("employees")
      .select("id, first_name, last_name, employment_status")
      .eq("company_id", session.companyId).order("last_name"),
  ]);

  // employees who are separated get priority in the picker
  const emps = (employees ?? []).sort((a, b) => {
    const sep = (e: any) => ["resigned", "terminated", "inactive"].includes(e.employment_status) ? 0 : 1;
    return sep(a) - sep(b);
  });

  return (
    <>
      <PageHeader title="Final Pay" subtitle="Last-pay preparation for separated employees — estimate only. Release requires approval and should occur within 30 days (DOLE LA 06-20)." />

      <Card className="mb-6">
        <CardHeader><CardTitle>Compute final pay</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={createFinalPay} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2">
              <Label>Employee</Label>
              <Select name="employee_id" required>
                <option value="">Select…</option>
                {emps.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.first_name} {e.last_name}{["resigned", "terminated", "inactive"].includes(e.employment_status) ? ` · ${e.employment_status}` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div><Label>Separation date</Label><Input type="date" name="separation_date" required /></div>
            <div>
              <Label>Reason</Label>
              <Select name="reason" defaultValue="resignation">
                {REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </Select>
            </div>
            <div><Label>Unpaid days worked</Label><Input type="number" name="days_worked" step="0.5" min={0} defaultValue={0} /></div>
            <div><Label>Unused leave days</Label><Input type="number" name="unused_leave_days" step="0.5" min={0} defaultValue={0} /></div>
            <div><Label>Allowances</Label><Input type="number" name="allowances" step="0.01" min={0} defaultValue={0} /></div>
            <div><Label>Cash advances</Label><Input type="number" name="cash_advances" step="0.01" min={0} defaultValue={0} /></div>
            <div><Label>Deductions</Label><Input type="number" name="deductions" step="0.01" min={0} defaultValue={0} /></div>
            <div><Label>Other liabilities</Label><Input type="number" name="other_liabilities" step="0.01" min={0} defaultValue={0} /></div>
            <div className="col-span-2 sm:col-span-4"><Label>Notes</Label><Textarea name="notes" rows={2} placeholder="Clearance status, turnover notes, etc." /></div>
            <div className="col-span-2 sm:col-span-4"><Button type="submit">Compute final pay</Button></div>
          </ActionForm>
          <p className="mt-2 text-xs text-gray-400">
            Auto-computes last salary and leave conversion from the daily rate (monthly × 12 ÷ 313), plus pro-rated 13th month.
            Statutory final withholding (BIR/SSS/PhilHealth/Pag-IBIG) is not modelled — verify before release.
          </p>
        </CardContent>
      </Card>

      <h2 className="mb-2 text-sm font-semibold text-gray-900">Final pay records</h2>
      {!records?.length ? (
        <EmptyState title="No final pay computed yet" hint="Pick a separated employee above to compute their last pay." />
      ) : (
        <div className="space-y-4">
          {records.map((r: any) => {
            const gross = Number(r.last_salary) + Number(r.pro_rated_13th) + Number(r.leave_conversion) + Number(r.allowances);
            const ded = Number(r.deductions) + Number(r.cash_advances) + Number(r.other_liabilities);
            return (
              <Card key={r.id}>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {r.employees?.first_name} {r.employees?.last_name}
                        <span className="ml-2 text-xs font-normal text-gray-400">{r.employees?.employee_number ?? ""}</span>
                      </p>
                      <p className="text-xs text-gray-500 capitalize">
                        {String(r.reason).replace(/_/g, " ")} · separated {r.separation_date}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge status={r.status}>{r.status}</Badge>
                      <span className="text-right">
                        <span className="block text-[11px] uppercase tracking-wide text-gray-400">Net final pay</span>
                        <span className="text-lg font-bold text-teal-700">{peso(r.net_final_pay)}</span>
                      </span>
                    </div>
                  </div>

                  {r.status === "draft" ? (
                    <ActionForm action={updateFinalPay} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" resetOnSuccess={false}>
                      <input type="hidden" name="id" value={r.id} />
                      <div><Label>Last salary</Label><Input type="number" step="0.01" name="last_salary" defaultValue={r.last_salary} /></div>
                      <div><Label>13th month</Label><Input type="number" step="0.01" name="pro_rated_13th" defaultValue={r.pro_rated_13th} /></div>
                      <div><Label>Leave conv.</Label><Input type="number" step="0.01" name="leave_conversion" defaultValue={r.leave_conversion} /></div>
                      <div><Label>Allowances</Label><Input type="number" step="0.01" name="allowances" defaultValue={r.allowances} /></div>
                      <div><Label>Deductions</Label><Input type="number" step="0.01" name="deductions" defaultValue={r.deductions} /></div>
                      <div><Label>Cash advances</Label><Input type="number" step="0.01" name="cash_advances" defaultValue={r.cash_advances} /></div>
                      <div><Label>Other liab.</Label><Input type="number" step="0.01" name="other_liabilities" defaultValue={r.other_liabilities} /></div>
                      <div className="flex items-end"><Button type="submit" variant="outline">Recalculate</Button></div>
                    </ActionForm>
                  ) : (
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600 sm:grid-cols-3">
                      <span>Last salary: {peso(r.last_salary)}</span>
                      <span>13th month: {peso(r.pro_rated_13th)}</span>
                      <span>Leave conversion: {peso(r.leave_conversion)}</span>
                      <span>Allowances: {peso(r.allowances)}</span>
                      <span>Gross: {peso(gross)}</span>
                      <span>Deductions: {peso(ded)}</span>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/60 pt-3">
                    {r.status === "draft" && canApprove && (
                      <ActionForm action={approveFinalPay} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <Button type="submit" size="sm">Approve</Button>
                      </ActionForm>
                    )}
                    {r.status !== "draft" && (
                      <>
                        {canApprove && (
                          <ActionForm action={generateFinalPayDocument} className="inline">
                            <input type="hidden" name="id" value={r.id} />
                            <Button type="submit" size="sm" variant="outline">Generate document</Button>
                          </ActionForm>
                        )}
                        <a href={`/api/export/final-pay/${r.id}?fmt=xlsx`} className="text-xs font-medium text-teal-700 hover:underline">XLSX</a>
                        <a href={`/api/export/final-pay/${r.id}?fmt=csv`} className="text-xs font-medium text-teal-700 hover:underline">CSV</a>
                        <Link href={`/console?q=${encodeURIComponent(`Generate a Certificate of Employment for ${r.employees?.first_name} ${r.employees?.last_name}. Use their employee record.`)}`} className="text-xs font-medium text-teal-700 hover:underline">COE via AI</Link>
                      </>
                    )}
                    {r.status === "approved" && canApprove && (
                      <ActionForm action={markFinalPayReleased} className="ml-auto inline" confirmText="Mark this final pay as released to the employee?">
                        <input type="hidden" name="id" value={r.id} />
                        <Button type="submit" size="sm" variant="accent">Mark released</Button>
                      </ActionForm>
                    )}
                    {r.released_at && <span className="ml-auto text-xs text-gray-400">Released {new Date(r.released_at).toLocaleDateString("en-PH")}</span>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
