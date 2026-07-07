import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { decideAiAction } from "@/lib/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Badge, Button, EmptyState, Card, CardContent, Input } from "@/components/ui";

export default async function ApprovalsPage() {
  const session = await requireSession();
  if (!can(session.role, "approvals.decide")) redirect("/dashboard");
  const supabase = await createClient();
  const { data: actions } = await supabase.from("ai_actions")
    .select("*").eq("company_id", session.companyId)
    .order("created_at", { ascending: false }).limit(50);

  const pending = (actions ?? []).filter((a) => a.status === "pending");
  const decided = (actions ?? []).filter((a) => a.status !== "pending");

  return (
    <>
      <PageHeader title="AI Approvals" subtitle={`${pending.length} action(s) waiting for a human decision`} />

      {!pending.length ? <EmptyState title="Nothing waiting for approval" hint="Sensitive AI actions (create employee, approve leave, payroll export…) appear here first." /> : (
        <div className="space-y-4">
          {pending.map((a: any) => (
            <Card key={a.id}>
              <CardContent className="pt-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold capitalize text-gray-900">{a.action_type.replace(/_/g, " ")}</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Tool: <code className="rounded bg-gray-100 px-1">{a.tool_name}</code> · Requested {new Date(a.created_at).toLocaleString("en-PH")}
                    </p>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted-bg p-3 text-xs text-gray-700">
                      {JSON.stringify(a.input, null, 2)}
                    </pre>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <ActionForm action={decideAiAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <Button type="submit">Approve & execute</Button>
                    </ActionForm>
                    <ActionForm action={decideAiAction} className="flex flex-col gap-1.5">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <Input name="reason" placeholder="Rejection reason" className="text-xs" />
                      <Button type="submit" variant="outline">Reject</Button>
                    </ActionForm>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold text-gray-900">Decision history</h2>
          <div className="space-y-2">
            {decided.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-line bg-white px-4 py-2.5">
                <div>
                  <p className="text-sm font-medium capitalize text-gray-800">{a.action_type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(a.created_at).toLocaleString("en-PH")}
                    {a.rejection_reason && ` · ${a.rejection_reason}`}
                    {a.output?.message && ` · ${a.output.message}`}
                  </p>
                </div>
                <Badge status={a.status}>{a.status}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
