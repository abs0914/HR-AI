"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/auth";
import {
  LayoutDashboard, Bot, Users, Clock, CalendarDays, Calculator, FolderOpen,
  UserSearch, BellRing, CheckSquare, ScrollText, Settings, LogOut,
} from "lucide-react";

const NAV: { href: string; label: string; icon: any; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/console", label: "Ask Kawani AI", icon: Bot },
  { href: "/employees", label: "Employees", icon: Users, roles: ["owner", "hr_admin", "manager", "accountant"] },
  { href: "/attendance", label: "Attendance", icon: Clock },
  { href: "/leave", label: "Leave", icon: CalendarDays },
  { href: "/payroll", label: "Payroll Prep", icon: Calculator, roles: ["owner", "hr_admin", "accountant"] },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/recruitment", label: "Recruitment", icon: UserSearch, roles: ["owner", "hr_admin"] },
  { href: "/compliance", label: "Compliance", icon: BellRing, roles: ["owner", "hr_admin", "manager", "accountant"] },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, roles: ["owner", "hr_admin"] },
  { href: "/audit", label: "Audit Logs", icon: ScrollText, roles: ["owner", "hr_admin"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["owner", "hr_admin"] },
];

export function SidebarNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
      {NAV.filter((item) => !item.roles || item.roles.includes(role)).map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <item.icon size={16} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
    >
      <LogOut size={16} /> Log out
    </button>
  );
}
