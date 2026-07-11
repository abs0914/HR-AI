import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPlatformAdmin } from "@/lib/platform-admin";

export type Role = "owner" | "hr_admin" | "manager" | "accountant" | "employee";

export type SessionContext = {
  userId: string;
  email: string;
  companyId: string;
  role: Role;
};

// Returns the authed user's company membership, or null.
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("company_users")
    .select("company_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;
  return {
    userId: user.id,
    email: user.email ?? "",
    companyId: membership.company_id,
    role: membership.role as Role,
  };
}

// For app pages: redirect to login/onboarding when not ready.
export async function requireSession(): Promise<SessionContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const ctx = await getSessionContext();
  if (!ctx) {
    const admin = await getPlatformAdmin();
    if (admin) redirect("/admin");
    redirect("/onboarding");
  }
  return ctx;
}
