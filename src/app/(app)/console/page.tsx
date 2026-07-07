import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Console } from "@/components/console";

export default async function ConsolePage() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: approvals } = await supabase
    .from("ai_actions")
    .select("id, tool_name, action_type, input, created_at")
    .eq("company_id", session.companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);
  const { data: recentFiles } = await supabase
    .from("employee_documents")
    .select("id, title, document_type, status, created_at")
    .eq("company_id", session.companyId)
    .eq("generated_by_ai", true)
    .order("created_at", { ascending: false })
    .limit(8);
  const { data: recentAudit } = await supabase
    .from("audit_logs")
    .select("action, module, created_at")
    .eq("company_id", session.companyId)
    .order("created_at", { ascending: false })
    .limit(6);

  return (
    <Console
      role={session.role}
      initialApprovals={approvals ?? []}
      initialFiles={recentFiles ?? []}
      recentAudit={recentAudit ?? []}
      canApprove={["owner", "hr_admin"].includes(session.role)}
    />
  );
}
