import Link from "next/link";
import { Toaster } from "@/components/action-form";
import { KawaniMark } from "@/components/logo";
import { LogoutButton } from "@/components/sidebar";
import { requirePlatformAdmin } from "@/lib/platform-admin";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/subscribers", label: "Subscribers" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/usage", label: "Token usage" },
  { href: "/admin/api-subscriptions", label: "API subscriptions" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();

  return (
    <div className="min-h-[100dvh]">
      <aside className="glass-strong fixed inset-y-0 left-0 z-40 hidden w-72 flex-col md:flex">
        <Link href="/admin" className="flex items-center gap-2.5 px-5 py-5">
          <KawaniMark size={38} />
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight"><span className="text-[#0e2a47]">Kawani</span> <span className="text-teal-600">AI</span></p>
            <p className="truncate text-xs text-gray-500">Platform admin</p>
          </div>
        </Link>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="neu-pressable flex items-center rounded-2xl px-3.5 py-2.5 text-sm font-medium text-gray-600 hover:bg-white/70"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-4">
          <p className="mb-2 truncate px-1 text-xs text-gray-400">{admin.email} - {admin.role.replace("_", " ")}</p>
          <p className="mb-3 px-1 text-[11px] leading-snug text-gray-400">Powered by PhilVirtualOffice Business Support Services</p>
          <LogoutButton />
        </div>
      </aside>

      <header className="glass fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-3 md:hidden">
        <Link href="/admin" className="flex items-center gap-2.5">
          <KawaniMark size={34} />
          <div className="leading-tight">
            <p className="text-sm font-bold"><span className="text-[#0e2a47]">Kawani</span> <span className="text-teal-600">AI</span></p>
            <p className="text-[11px] text-gray-500">Platform admin</p>
          </div>
        </Link>
        <LogoutButton />
      </header>

      <div className="md:ml-72">
        <main className="mx-auto max-w-7xl px-4 pb-10 pt-24 md:px-8 md:pt-8">
          <div className="mb-5 flex gap-2 overflow-x-auto md:hidden">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-600">
                {item.label}
              </Link>
            ))}
          </div>
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
