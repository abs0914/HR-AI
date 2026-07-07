import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { PageHeader, Table, Th, Td, Button, EmptyState, Input, Label, Select } from "@/components/ui";

const MODULES = ["employees", "documents", "attendance", "leave", "payroll", "recruitment", "compliance", "ai", "settings", "auth"];

export default async function AuditPage({ searchParams }: {
  searchParams: Promise<{ module?: string; action?: string; from?: string; to?: string }>;
}) {
  const session = await requireSession();
  if (!can(session.role, "audit.read")) redirect("/dashboard");
  const sp = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("audit_logs")
    .select("*, employees(first_name, last_name)")
    .eq("company_id", session.companyId)
    .order("created_at", { ascending: false }).limit(200);
  if (sp.module) query = query.eq("module", sp.module);
  if (sp.action) query = query.ilike("action", `%${sp.action}%`);
  if (sp.from) query = query.gte("created_at", sp.from);
  if (sp.to) query = query.lte("created_at", sp.to + "T23:59:59");
  const { data: logs } = await query;

  return (
    <>
      <PageHeader title="Audit Logs" subtitle={`${logs?.length ?? 0} event(s) (latest 200)`} />

      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <div>
          <Label>Module</Label>
          <Select name="module" defaultValue={sp.module ?? ""} className="w-40">
            <option value="">All</option>
            {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
        <div><Label>Action contains</Label><Input name="action" defaultValue={sp.action ?? ""} placeholder="e.g. approved" /></div>
        <div><Label>From</Label><Input type="date" name="from" defaultValue={sp.from ?? ""} /></div>
        <div><Label>To</Label><Input type="date" name="to" defaultValue={sp.to ?? ""} /></div>
        <Button type="submit" variant="outline">Filter</Button>
      </form>

      {!logs?.length ? <EmptyState title="No audit events match" /> : (
        <Table>
          <thead><tr><Th>Time</Th><Th>Module</Th><Th>Action</Th><Th>Employee</Th><Th>Details</Th></tr></thead>
          <tbody>
            {logs.map((l: any) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap text-xs">{new Date(l.created_at).toLocaleString("en-PH")}</Td>
                <Td>{l.module}</Td>
                <Td className="font-medium">{l.action.replace(/_/g, " ")}</Td>
                <Td>{l.employees ? `${l.employees.first_name} ${l.employees.last_name}` : "—"}</Td>
                <Td className="max-w-md truncate text-xs text-gray-400">{l.details ? JSON.stringify(l.details) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
