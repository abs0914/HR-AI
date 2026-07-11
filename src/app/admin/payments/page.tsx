import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { updatePaymentGateway } from "@/lib/admin-actions";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = ["active", "paused", "disabled"];
const MODES = ["test", "live"];

export default async function PaymentsPage() {
  await requirePlatformAdmin();
  const supabase = createAdminClient();
  const [{ data: gateway }, { data: audits = [] }, { data: companies = [] }] = await Promise.all([
    supabase.from("payment_gateway_settings").select("*").eq("provider", "paymongo").maybeSingle(),
    supabase.from("audit_logs").select("created_at,action,details,company_id,companies(name)").eq("module", "billing").order("created_at", { ascending: false }).limit(20),
    supabase.from("companies").select("name,plan,billing_status,billing_employee_count,billing_reference,paid_until").not("billing_reference", "is", null).order("updated_at", { ascending: false }).limit(10),
  ]);

  const webhookUrl = gateway?.webhook_url ?? "https://kawaniai.com/api/billing/webhook";
  const envChecks = [
    { label: "PAYMONGO_SECRET_KEY", ok: !!process.env.PAYMONGO_SECRET_KEY },
    { label: "PAYMONGO_WEBHOOK_SECRET", ok: !!process.env.PAYMONGO_WEBHOOK_SECRET },
    { label: "APP_URL", ok: process.env.APP_URL === "https://kawaniai.com" },
  ];

  return (
    <>
      <PageHeader title="Payment Gateway" subtitle="Manage PayMongo operating mode, webhook routing, and billing event visibility." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>PayMongo Settings</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={updatePaymentGateway} className="grid gap-3 md:grid-cols-2" resetOnSuccess={false}>
              <input type="hidden" name="provider" value="paymongo" />
              <div>
                <Label>Status</Label>
                <Select name="status" defaultValue={gateway?.status ?? "active"}>
                  {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
              </div>
              <div>
                <Label>Mode</Label>
                <Select name="mode" defaultValue={gateway?.mode ?? "test"}>
                  {MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Webhook URL</Label>
                <Input name="webhook_url" defaultValue={webhookUrl} />
              </div>
              <div className="md:col-span-2">
                <Label>Admin notes</Label>
                <Textarea name="notes" defaultValue={gateway?.notes ?? ""} rows={4} />
              </div>
              <div className="md:col-span-2">
                <Button type="submit">Save gateway settings</Button>
              </div>
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Configuration Health</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {envChecks.map((check) => (
              <div key={check.label} className="flex items-center justify-between rounded-2xl bg-white/50 px-3 py-2">
                <span className="text-xs font-semibold text-gray-600">{check.label}</span>
                <Badge status={check.ok ? "active" : "failed"}>{check.ok ? "set" : "missing"}</Badge>
              </div>
            ))}
            <p className="pt-2 text-xs text-gray-500">Secrets are intentionally managed through server environment variables, not the admin UI.</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent Billing Events</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <thead><tr><Th>Date</Th><Th>Company</Th><Th>Action</Th><Th>Reference</Th></tr></thead>
              <tbody>
                {(audits as any[]).map((audit) => (
                  <tr key={`${audit.company_id}-${audit.created_at}-${audit.action}`}>
                    <Td>{new Date(audit.created_at).toLocaleString("en-PH")}</Td>
                    <Td>{audit.companies?.name ?? audit.company_id}</Td>
                    <Td>{audit.action}</Td>
                    <Td>{audit.details?.reference ?? "-"}</Td>
                  </tr>
                ))}
                {(audits as any[]).length === 0 && <tr><Td colSpan={4}>No billing events yet.</Td></tr>}
              </tbody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Latest Paid References</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <thead><tr><Th>Company</Th><Th>Plan</Th><Th>Status</Th><Th>Reference</Th></tr></thead>
              <tbody>
                {(companies as any[]).map((company) => (
                  <tr key={company.billing_reference}>
                    <Td>{company.name}</Td>
                    <Td>{company.plan}</Td>
                    <Td><Badge status={company.billing_status}>{company.billing_status}</Badge></Td>
                    <Td className="font-mono text-xs">{company.billing_reference}</Td>
                  </tr>
                ))}
                {(companies as any[]).length === 0 && <tr><Td colSpan={4}>No PayMongo billing references yet.</Td></tr>}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
