import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { aggregateAiMessages, formatNumber } from "@/lib/admin-analytics";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function UsagePage() {
  await requirePlatformAdmin();
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: companies = [] }, { data: messages = [] }, { data: apiSubscriptions = [] }] = await Promise.all([
    supabase.from("companies").select("id,name,plan"),
    supabase.from("ai_messages").select("company_id,metadata,created_at").eq("role", "assistant").gte("created_at", since).limit(10000),
    supabase.from("api_subscriptions").select("company_id,name,status,monthly_quota_tokens,used_tokens,companies(name)").order("updated_at", { ascending: false }),
  ]);

  const companyNames = new Map((companies as any[]).map((company) => [company.id, company.name]));
  const usage = aggregateAiMessages(messages as any[], companyNames);

  return (
    <>
      <PageHeader title="Token Utilization" subtitle="Monitor AI provider tokens and API subscription quota usage over the last 30 days." />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Total Tokens</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-gray-900">{formatNumber(usage.totals.totalTokens)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Input Tokens</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-gray-900">{formatNumber(usage.totals.inputTokens)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Output Tokens</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-gray-900">{formatNumber(usage.totals.outputTokens)}</p></CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>AI Provider Usage</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <thead><tr><Th>Company</Th><Th>Provider</Th><Th>Model</Th><Th>Calls</Th><Th>Input</Th><Th>Output</Th><Th>Total</Th></tr></thead>
            <tbody>
              {usage.rows.map((row) => (
                <tr key={`${row.companyId}-${row.provider}-${row.model}`}>
                  <Td>{row.companyName}</Td>
                  <Td>{row.provider}</Td>
                  <Td>{row.model}</Td>
                  <Td>{formatNumber(row.calls)}</Td>
                  <Td>{formatNumber(row.inputTokens)}</Td>
                  <Td>{formatNumber(row.outputTokens)}</Td>
                  <Td>{formatNumber(row.totalTokens)}</Td>
                </tr>
              ))}
              {usage.rows.length === 0 && <tr><Td colSpan={7}>No AI token usage found in the last 30 days.</Td></tr>}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>API Subscription Quotas</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <thead><tr><Th>Company</Th><Th>Subscription</Th><Th>Status</Th><Th>Used</Th><Th>Quota</Th><Th>Utilization</Th></tr></thead>
            <tbody>
              {(apiSubscriptions as any[]).map((sub) => {
                const quota = Number(sub.monthly_quota_tokens ?? 0);
                const used = Number(sub.used_tokens ?? 0);
                const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
                return (
                  <tr key={sub.name + sub.company_id}>
                    <Td>{sub.companies?.name ?? companyNames.get(sub.company_id) ?? sub.company_id}</Td>
                    <Td>{sub.name}</Td>
                    <Td><Badge status={sub.status}>{sub.status}</Badge></Td>
                    <Td>{formatNumber(used)}</Td>
                    <Td>{quota ? formatNumber(quota) : "unlimited"}</Td>
                    <Td>{quota ? `${pct}%` : "-"}</Td>
                  </tr>
                );
              })}
              {(apiSubscriptions as any[]).length === 0 && <tr><Td colSpan={6}>No API subscriptions yet.</Td></tr>}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
