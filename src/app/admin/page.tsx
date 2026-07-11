import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, Table, Td, Th } from "@/components/ui";
import { aggregateAiMessages, formatNumber } from "@/lib/admin-analytics";
import { PLAN_CONFIG, effectivePlan, normalizePlan, type Plan } from "@/lib/billing";
import { requirePlatformAdmin } from "@/lib/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default async function AdminDashboard() {
  await requirePlatformAdmin();
  const supabase = createAdminClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [
    { data: companies = [] },
    { data: employees = [] },
    { data: messages = [] },
    { data: apiSubscriptions = [] },
    { data: gateway },
  ] = await Promise.all([
    supabase.from("companies").select("id,name,plan,billing_status,billing_employee_count,paid_until,plan_expires_at,created_at").order("created_at", { ascending: false }),
    supabase.from("employees").select("company_id,employment_status"),
    supabase.from("ai_messages").select("company_id,metadata").eq("role", "assistant").gte("created_at", since).limit(5000),
    supabase.from("api_subscriptions").select("status,monthly_quota_tokens,used_tokens"),
    supabase.from("payment_gateway_settings").select("*").eq("provider", "paymongo").maybeSingle(),
  ]);

  const companyNames = new Map((companies as any[]).map((c) => [c.id, c.name]));
  const usage = aggregateAiMessages(messages as any[], companyNames);
  const activeEmployees = (employees as any[]).filter((e) => !["resigned", "terminated", "inactive"].includes(e.employment_status)).length;
  const planCounts = (companies as any[]).reduce<Record<Plan, number>>((acc, company) => {
    const plan = effectivePlan(company);
    acc[plan] += 1;
    return acc;
  }, { free: 0, core: 0, business: 0, pro: 0, enterprise: 0 });
  const activeApi = (apiSubscriptions as any[]).filter((s) => s.status === "active").length;
  const apiQuota = (apiSubscriptions as any[]).reduce((sum, s) => sum + Number(s.monthly_quota_tokens ?? 0), 0);
  const apiUsed = (apiSubscriptions as any[]).reduce((sum, s) => sum + Number(s.used_tokens ?? 0), 0);
  const latestCompanies = (companies as any[]).slice(0, 6);

  return (
    <>
      <PageHeader
        title="Platform Admin"
        subtitle="Manage Kawani AI subscribers, billing operations, token usage, and API access."
      >
        <Link href="/dashboard" className="rounded-full bg-white/70 px-3 py-2 text-xs font-semibold text-gray-600">Tenant app</Link>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Companies" value={(companies as any[]).length} hint={`${formatNumber(activeEmployees)} active employees tracked`} />
        <Stat label="30-day AI tokens" value={formatNumber(usage.totals.totalTokens)} hint={`${formatNumber(usage.totals.calls)} assistant calls`} />
        <Stat label="API subscriptions" value={activeApi} hint={`${formatNumber(apiUsed)} / ${formatNumber(apiQuota)} quota tokens used`} />
        <Stat label="PayMongo" value={gateway?.status ?? "active"} hint={`${gateway?.mode ?? "test"} mode - secret ${process.env.PAYMONGO_SECRET_KEY ? "configured" : "missing"}`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Plan Mix</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(Object.keys(PLAN_CONFIG) as Plan[]).map((plan) => (
              <div key={plan} className="flex items-center justify-between rounded-2xl bg-white/50 px-3 py-2">
                <span className="text-sm font-medium text-gray-700">{PLAN_CONFIG[plan].name}</span>
                <Badge status={planCounts[plan] ? "active" : "inactive"}>{planCounts[plan]}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Top Token Users, Last 30 Days</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <thead><tr><Th>Company</Th><Th>Engine</Th><Th>Calls</Th><Th>Tokens</Th></tr></thead>
              <tbody>
                {usage.rows.slice(0, 5).map((row) => (
                  <tr key={`${row.companyId}-${row.provider}-${row.model}`}>
                    <Td>{row.companyName}</Td>
                    <Td>{row.provider} - {row.model}</Td>
                    <Td>{formatNumber(row.calls)}</Td>
                    <Td>{formatNumber(row.totalTokens)}</Td>
                  </tr>
                ))}
                {usage.rows.length === 0 && <tr><Td colSpan={4}>No metered AI usage in the last 30 days.</Td></tr>}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Newest Subscribers</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <thead><tr><Th>Company</Th><Th>Plan</Th><Th>Status</Th><Th>Employees</Th><Th>Created</Th></tr></thead>
            <tbody>
              {latestCompanies.map((company) => {
                const plan = normalizePlan(company.plan);
                return (
                  <tr key={company.id}>
                    <Td>{company.name}</Td>
                    <Td>{PLAN_CONFIG[plan].name}</Td>
                    <Td><Badge status={company.billing_status}>{company.billing_status ?? "free"}</Badge></Td>
                    <Td>{company.billing_employee_count ?? "-"}</Td>
                    <Td>{company.created_at ? new Date(company.created_at).toLocaleDateString("en-PH") : "-"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
