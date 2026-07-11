import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { updateSubscriberPlan } from "@/lib/admin-actions";
import { PLAN_CONFIG, effectivePlan, normalizePlan, type Plan } from "@/lib/billing";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const BILLING_STATUSES = ["free", "checkout_pending", "subscription_pending", "active", "past_due", "unpaid", "expired", "cancelled", "custom"];
const PLAN_KEYS = Object.keys(PLAN_CONFIG) as Plan[];

function dateValue(value?: string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

export default async function SubscribersPage() {
  await requirePlatformAdmin();
  const supabase = createAdminClient();
  const [{ data: companies = [] }, { data: employees = [] }, { data: branches = [] }] = await Promise.all([
    supabase.from("companies").select("id,name,plan,billing_status,billing_employee_count,billing_reference,paid_until,plan_expires_at,paymongo_subscription_id,paymongo_subscription_status,created_at").order("created_at", { ascending: false }),
    supabase.from("employees").select("company_id,employment_status"),
    supabase.from("branches").select("company_id"),
  ]);

  const employeeCounts = new Map<string, number>();
  for (const employee of employees as any[]) {
    if (["resigned", "terminated", "inactive"].includes(employee.employment_status)) continue;
    employeeCounts.set(employee.company_id, (employeeCounts.get(employee.company_id) ?? 0) + 1);
  }
  const branchCounts = new Map<string, number>();
  for (const branch of branches as any[]) {
    branchCounts.set(branch.company_id, (branchCounts.get(branch.company_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        title="Subscribers"
        subtitle="Update company plans, billing counts, paid-through dates, and billing references."
      />

      <Card>
        <CardHeader><CardTitle>Company Subscriptions</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>Company</Th>
                <Th>Current</Th>
                <Th>Workspace</Th>
                <Th>Admin controls</Th>
              </tr>
            </thead>
            <tbody>
              {(companies as any[]).map((company) => {
                const plan = normalizePlan(company.plan);
                const activePlan = effectivePlan(company);
                const paidUntil = company.paid_until ?? company.plan_expires_at;
                return (
                  <tr key={company.id} className="align-top">
                    <Td>
                      <div className="font-semibold text-gray-900">{company.name}</div>
                      <div className="mt-1 text-xs text-gray-400">{company.id}</div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge status={activePlan === "free" ? "inactive" : "active"}>{PLAN_CONFIG[plan].name}</Badge>
                        <Badge status={company.billing_status}>{company.billing_status ?? "free"}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        Paid until: {paidUntil ? new Date(paidUntil).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "not set"}
                      </p>
                      {company.paymongo_subscription_id && (
                        <p className="mt-1 font-mono text-[11px] text-gray-400">{company.paymongo_subscription_id}</p>
                      )}
                    </Td>
                    <Td>
                      <p>{employeeCounts.get(company.id) ?? 0} active employees</p>
                      <p className="text-xs text-gray-500">{branchCounts.get(company.id) ?? 0} branches</p>
                    </Td>
                    <Td className="min-w-[520px]">
                      <ActionForm action={updateSubscriberPlan} className="grid grid-cols-2 gap-2 lg:grid-cols-6" resetOnSuccess={false}>
                        <input type="hidden" name="company_id" value={company.id} />
                        <div>
                          <Label>Plan</Label>
                          <Select name="plan" defaultValue={plan}>
                            {PLAN_KEYS.map((p) => <option key={p} value={p}>{PLAN_CONFIG[p].name}</option>)}
                          </Select>
                        </div>
                        <div>
                          <Label>Status</Label>
                          <Select name="billing_status" defaultValue={company.billing_status ?? "free"}>
                            {BILLING_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                          </Select>
                        </div>
                        <div>
                          <Label>Bill count</Label>
                          <Input name="billing_employee_count" type="number" min="0" defaultValue={company.billing_employee_count ?? 0} />
                        </div>
                        <div>
                          <Label>Paid until</Label>
                          <Input name="paid_until" type="date" defaultValue={dateValue(paidUntil)} />
                        </div>
                        <div>
                          <Label>Reference</Label>
                          <Input name="billing_reference" defaultValue={company.billing_reference ?? ""} placeholder="kawaniai_..." />
                        </div>
                        <div className="flex items-end">
                          <Button type="submit" size="sm" className="w-full">Save</Button>
                        </div>
                      </ActionForm>
                    </Td>
                  </tr>
                );
              })}
              {(companies as any[]).length === 0 && <tr><Td colSpan={4}>No subscribers yet.</Td></tr>}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
