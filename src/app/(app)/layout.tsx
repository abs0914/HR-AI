import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Toaster } from "@/components/action-form";
import { SidebarNav, BottomNav, LogoutButton } from "@/components/sidebar";
import { Bot } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("name").eq("id", session.companyId).single();

  const logo = (
    <span className="orb flex h-9 w-9 items-center justify-center">
      <Bot size={18} className="relative z-10 text-white drop-shadow" />
    </span>
  );

  return (
    <div className="min-h-[100dvh]">
      {/* desktop sidebar */}
      <aside className="glass-strong fixed inset-y-0 left-0 z-40 hidden w-64 flex-col md:flex">
        <Link href="/console" className="flex items-center gap-2.5 px-5 py-5">
          {logo}
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight">HR AI</p>
            <p className="truncate text-xs text-gray-500">{company?.name}</p>
          </div>
        </Link>
        <SidebarNav role={session.role} />
        <div className="px-4 py-4">
          <p className="mb-2 truncate px-1 text-xs text-gray-400">{session.email} · {session.role.replace("_", " ")}</p>
          <LogoutButton />
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="glass fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3 md:hidden">
        <Link href="/console" className="flex items-center gap-2.5">
          {logo}
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-bold">HR AI</p>
            <p className="truncate text-[11px] text-gray-500">{company?.name}</p>
          </div>
        </Link>
        <span className="rounded-full bg-white/60 px-3 py-1 text-[11px] font-semibold capitalize text-teal-700">
          {session.role.replace("_", " ")}
        </span>
      </header>

      <div className="md:ml-64">
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-20 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>

      <BottomNav role={session.role} email={session.email} />
      <Toaster />
    </div>
  );
}
