import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { createLeaveRequest, decideLeaveRequest } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Table, Th, Td, Badge, Button, EmptyState, Input, Label, Select, Textarea, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

const LEAVE_TYPES = ["vacation", "sick", "emergency", "maternity", "paternity", "solo_parent", "bereavement", "service_incentive", "unpaid", "other"];

export default async function LeavePage() {
  const session = await requireSession();
  const supabase = await createClient();
  const canApprove = can(session.role, "leave.approve");

  const [{ data: requests }, { data: employees }, { data: balances }] = await Promise.all([
    supabase.from("leave_requests")
      .select("*, employees(first_name, last_name)")
      .eq("company_id", session.companyId)
      .order("created_at", { ascending: false }).limit(100),
    supabase.from("employees").select("id, first_name, last_name").eq("company_id", session.companyId).order("last_name"),
    supabase.from("leave_balances")
      .select("leave_type, balance, used, employees(first_name, last_name)")
      .eq("company_id", session.companyId).eq("year", new Date().getFullYear()),
  ]);

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const rest = (requests ?? []).filter((r) => r.status !== "pending");

  return (
    <>
      <PageHeader title="Leave Management" subtitle={`${pending.length} pending request(s)`} />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>File a leave request</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={createLeaveRequest} className="grid grid-cols-2 gap-3">
              {session.role !== "employee" && (
                <div className="col-span-2">
                  <Label>Employee</Label>
                  <Select name="employee_id" required>
                    <option value="">Select…</option>
                    {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
                  </Select>
                </div>
              )}
              <div>
                <Label>Leave type</Label>
                <Select name="leave_type" required>
                  {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2 col-span-1">
                <div><Label>Start</Label><Input type="date" name="start_date" required /></div>
                <div><Label>End</Label><Input type="date" name="end_date" required /></div>
              </div>
              <div className="col-span-2"><Label>Reason</Label><Textarea name="reason" rows={2} /></div>
              <div className="col-span-2"><Button type="submit">Submit request</Button></div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Leave balances ({new Date().getFullYear()})</CardTitle></CardHeader>
          <CardContent>
            {!balances?.length ? <p className="text-sm text-gray-400">No balances recorded yet.</p> : (
              <div className="max-h-64 space-y-1 overflow-y-auto text-sm">
                {balances.map((b: any, i) => (
                  <div key={i} className="flex justify-between border-b border-line py-1 last:border-0">
                    <span>{b.employees?.first_name} {b.employees?.last_name} · <span className="capitalize text-gray-500">{b.leave_type.replace("_", " ")}</span></span>
                    <span className="font-medium">{Number(b.balance) - Number(b.used)} / {Number(b.balance)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-900">Pending requests</h2>
      {!pending.length ? <EmptyState title="No pending leave requests" /> : (
        <Table>
          <thead><tr><Th>Employee</Th><Th>Type</Th><Th>Dates</Th><Th>Reason</Th>{canApprove && <Th>Decision</Th>}</tr></thead>
          <tbody>
            {pending.map((r: any) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.employees?.first_name} {r.employees?.last_name}</Td>
                <Td className="capitalize">{r.leave_type.replace("_", " ")}</Td>
                <Td>{r.start_date} → {r.end_date}</Td>
                <Td className="max-w-xs truncate">{r.reason ?? "—"}</Td>
                {canApprove && (
                  <Td>
                    <span className="flex gap-1.5">
                      <ActionForm action={decideLeaveRequest} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="decision" value="approved" />
                        <Button type="submit" size="sm">Approve</Button>
                      </ActionForm>
                      <ActionForm action={decideLeaveRequest} className="inline">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="decision" value="rejected" />
                        <Button type="submit" size="sm" variant="outline">Reject</Button>
                      </ActionForm>
                    </span>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h2 className="mb-2 mt-8 text-sm font-semibold text-gray-900">History</h2>
      {!rest.length ? <EmptyState title="No leave history yet" /> : (
        <Table>
          <thead><tr><Th>Employee</Th><Th>Type</Th><Th>Dates</Th><Th>Status</Th><Th>Notes</Th></tr></thead>
          <tbody>
            {rest.map((r: any) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.employees?.first_name} {r.employees?.last_name}</Td>
                <Td className="capitalize">{r.leave_type.replace("_", " ")}</Td>
                <Td>{r.start_date} → {r.end_date}</Td>
                <Td><Badge status={r.status}>{r.status}</Badge></Td>
                <Td className="max-w-xs truncate text-xs text-gray-400">{r.rejection_reason ?? r.reason ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
