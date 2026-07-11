import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PlatformAdmin = {
  userId: string;
  email: string;
  role: "super_admin" | "support_admin" | "billing_admin";
};

const BOOTSTRAP_ADMIN_EMAIL = "admin@kawaniai.com";

export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const email = user.email.toLowerCase();
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_admins")
    .select("role, status")
    .or(`user_id.eq.${user.id},email.eq.${email}`)
    .maybeSingle();

  if (data?.status === "active") {
    return { userId: user.id, email, role: data.role as PlatformAdmin["role"] };
  }

  if (email === BOOTSTRAP_ADMIN_EMAIL) {
    const { data: created, error } = await admin
      .from("platform_admins")
      .upsert({
        user_id: user.id,
        email,
        role: "super_admin",
        status: "active",
        updated_at: new Date().toISOString(),
      }, { onConflict: "email" })
      .select("role")
      .single();
    if (!error && created) return { userId: user.id, email, role: created.role as PlatformAdmin["role"] };
  }

  return null;
}

export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/dashboard");
  return admin;
}
