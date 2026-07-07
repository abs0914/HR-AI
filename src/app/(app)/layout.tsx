import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Toaster } from "@/components/action-form";
import { SidebarNav, LogoutButton } from "@/components/sidebar";
import { Bot } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name").eq("id", session.companyId).single();

  return (
    <div className="flex min-h-screen bg-muted-bg">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-white md:flex">
        <Link href="/dashboard" className="flex items-center gap-2 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white"><Bot size={17} /></div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight">HR AI</p>
            <p className="truncate text-xs text-gray-500">{company?.name}</p>
          </div>
        </Link>
        <SidebarNav role={session.role} />
        <div className="border-t border-line px-3 py-3">
          <p className="mb-2 truncate px-2 text-xs text-gray-400">{session.email} · {session.role.replace("_", " ")}</p>
          <LogoutButton />
        </div>
      </aside>
      <div className="flex-1 md:ml-60">
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
