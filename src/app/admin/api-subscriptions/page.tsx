import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import {
  createApiSubscription,
  resetApiSubscriptionUsage,
  revokeApiSubscription,
  updateApiSubscription,
} from "@/lib/admin-actions";
import { formatNumber } from "@/lib/admin-analytics";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUSES = ["active", "paused", "revoked"];

export default async function ApiSubscriptionsPage() {
  await requirePlatformAdmin();
  const supabase = createAdminClient();
  const [{ data: companies = [] }, { data: subscriptions = [] }] = await Promise.all([
    supabase.from("companies").select("id,name,plan").order("name", { ascending: true }),
    supabase.from("api_subscriptions").select("*,companies(name)").order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <PageHeader title="API Subscriptions" subtitle="Issue and manage tenant API access with token quotas and revocation controls." />

      <Card>
        <CardHeader><CardTitle>Create API Subscription</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={createApiSubscription} className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label>Company</Label>
              <Select name="company_id" required defaultValue="">
                <option value="" disabled>Select company</option>
                {(companies as any[]).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Name</Label>
              <Input name="name" required placeholder="Production API" />
            </div>
            <div>
              <Label>Monthly token quota</Label>
              <Input name="monthly_quota_tokens" type="number" min="0" defaultValue={0} />
            </div>
            <div>
              <Label>Allowed origins</Label>
              <Input name="allowed_origins" placeholder="https://example.com" />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">Create token</Button>
            </div>
            <div className="md:col-span-2 lg:col-span-5">
              <Label>Notes</Label>
              <Textarea name="notes" rows={2} placeholder="Purpose, owner, support notes" />
            </div>
          </ActionForm>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Existing API Subscriptions</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>Tenant</Th>
                <Th>Token</Th>
                <Th>Usage</Th>
                <Th>Controls</Th>
              </tr>
            </thead>
            <tbody>
              {(subscriptions as any[]).map((sub) => {
                const quota = Number(sub.monthly_quota_tokens ?? 0);
                const used = Number(sub.used_tokens ?? 0);
                return (
                  <tr key={sub.id} className="align-top">
                    <Td>
                      <div className="font-semibold text-gray-900">{sub.companies?.name ?? sub.company_id}</div>
                      <div className="mt-1 text-xs text-gray-500">{sub.name}</div>
                    </Td>
                    <Td>
                      <Badge status={sub.status}>{sub.status}</Badge>
                      <p className="mt-2 font-mono text-xs text-gray-500">{sub.token_prefix}...</p>
                      <p className="mt-1 text-xs text-gray-400">Created {new Date(sub.created_at).toLocaleDateString("en-PH")}</p>
                    </Td>
                    <Td>
                      <p>{formatNumber(used)} used</p>
                      <p className="text-xs text-gray-500">{quota ? `${formatNumber(quota)} monthly quota` : "Unlimited quota"}</p>
                    </Td>
                    <Td className="min-w-[520px]">
                      <ActionForm action={updateApiSubscription} className="grid grid-cols-2 gap-2 lg:grid-cols-5" resetOnSuccess={false}>
                        <input type="hidden" name="id" value={sub.id} />
                        <input type="hidden" name="company_id" value={sub.company_id} />
                        <div>
                          <Label>Status</Label>
                          <Select name="status" defaultValue={sub.status}>
                            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                          </Select>
                        </div>
                        <div>
                          <Label>Quota</Label>
                          <Input name="monthly_quota_tokens" type="number" min="0" defaultValue={quota} />
                        </div>
                        <div>
                          <Label>Origins</Label>
                          <Input name="allowed_origins" defaultValue={sub.allowed_origins ?? ""} />
                        </div>
                        <div>
                          <Label>Notes</Label>
                          <Input name="notes" defaultValue={sub.notes ?? ""} />
                        </div>
                        <div className="flex items-end">
                          <Button type="submit" size="sm" className="w-full">Save</Button>
                        </div>
                      </ActionForm>
                      <div className="mt-2 flex gap-2">
                        <ActionForm action={resetApiSubscriptionUsage} resetOnSuccess={false}>
                          <input type="hidden" name="id" value={sub.id} />
                          <input type="hidden" name="company_id" value={sub.company_id} />
                          <Button type="submit" size="sm" variant="outline">Reset usage</Button>
                        </ActionForm>
                        <ActionForm action={revokeApiSubscription} resetOnSuccess={false} confirmText={`Revoke API subscription "${sub.name}"?`}>
                          <input type="hidden" name="id" value={sub.id} />
                          <input type="hidden" name="company_id" value={sub.company_id} />
                          <input type="hidden" name="monthly_quota_tokens" value={quota} />
                          <input type="hidden" name="allowed_origins" value={sub.allowed_origins ?? ""} />
                          <input type="hidden" name="notes" value={sub.notes ?? ""} />
                          <Button type="submit" size="sm" variant="danger">Revoke</Button>
                        </ActionForm>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {(subscriptions as any[]).length === 0 && <tr><Td colSpan={4}>No API subscriptions yet.</Td></tr>}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
