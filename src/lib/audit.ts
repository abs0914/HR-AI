import { createAdminClient } from "@/lib/supabase/admin";

// Inserts with the service role (audit_logs has no insert policy for users:
// clients must not be able to forge or skip audit entries).
export async function logAudit(entry: {
  companyId: string;
  userId?: string | null;
  employeeId?: string | null;
  module: string;
  action: string;
  details?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_logs").insert({
    company_id: entry.companyId,
    user_id: entry.userId ?? null,
    employee_id: entry.employeeId ?? null,
    module: entry.module,
    action: entry.action,
    details: entry.details ?? {},
  });
  if (error) console.error("audit log failed:", error.message);
}
