"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/auth";
import {
  LayoutDashboard, Bot, Users, Clock, CalendarDays, Calculator, FolderOpen,
  UserSearch, BellRing, CheckSquare, ScrollText, Settings, LogOut, Grid3x3, X, Wallet,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: any; roles?: Role[] };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/console", label: "Ask Kawani AI", icon: Bot },
  { href: "/employees", label: "Employees", icon: Users, roles: ["owner", "hr_admin", "manager", "accountant"] },
  { href: "/attendance", label: "Attendance", icon: Clock },
  { href: "/leave", label: "Leave", icon: CalendarDays },
  { href: "/payroll", label: "Payroll Prep", icon: Calculator, roles: ["owner", "hr_admin", "accountant"] },
  { href: "/final-pay", label: "Final Pay", icon: Wallet, roles: ["owner", "hr_admin", "accountant"] },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/recruitment", label: "Recruitment", icon: UserSearch, roles: ["owner", "hr_admin"] },
  { href: "/compliance", label: "Compliance", icon: BellRing, roles: ["owner", "hr_admin", "manager", "accountant"] },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, roles: ["owner", "hr_admin"] },
  { href: "/audit", label: "Audit Logs", icon: ScrollText, roles: ["owner", "hr_admin"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["owner", "hr_admin"] },
];

const allowed = (role: Role) => NAV.filter((i) => !i.roles || i.roles.includes(role));
const useActive = () => {
  const p = usePathname();
  return (href: string) => p === href || p.startsWith(href + "/");
};

// ---------- desktop sidebar ----------
export function SidebarNav({ role }: { role: Role }) {
  const isActive = useActive();
  return (
    <nav className="hide-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-2">
      {allowed(role).map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`neu-pressable flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium ${
              active ? "bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-[0_8px_20px_-10px_rgba(15,118,110,0.7)]" : "text-gray-600 hover:bg-white/70"
            }`}
          >
            <item.icon size={17} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ---------- mobile bottom nav (center AI orb) + more sheet ----------
export function BottomNav({ role, email }: { role: Role; email: string }) {
  const isActive = useActive();
  const [sheet, setSheet] = useState(false);
  const items = allowed(role).filter((i) => i.href !== "/console");
  const left = items.slice(0, 2);
  const right = items.slice(2, 3);
  const more = items.slice(3);

  const Tab = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href);
    return (
      <Link href={item.href} className="neu-pressable flex flex-1 flex-col items-center gap-1 py-1">
        <item.icon size={20} className={active ? "text-teal-600" : "text-gray-400"} />
        <span className={`text-[10px] font-medium ${active ? "text-teal-600" : "text-gray-400"}`}>{item.label.split(" ")[0]}</span>
      </Link>
    );
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">
        <div className="pb-safe glass-strong mx-3 mb-3 flex items-end rounded-[28px] px-2 pt-2 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.28)]">
          {left.map((i) => <Tab key={i.href} item={i} />)}

          {/* center AI orb */}
          <Link href="/console" className="neu-pressable -mt-7 flex flex-1 flex-col items-center">
            <span className={`orb flex h-14 w-14 items-center justify-center ${isActive("/console") ? "pulse-ring" : ""}`}>
              <Bot size={24} className="relative z-10 text-white drop-shadow" />
            </span>
            <span className="mt-0.5 text-[10px] font-semibold text-teal-700">Kawani</span>
          </Link>

          {right.map((i) => <Tab key={i.href} item={i} />)}

          <button onClick={() => setSheet(true)} className="neu-pressable flex flex-1 flex-col items-center gap-1 py-1">
            <Grid3x3 size={20} className="text-gray-400" />
            <span className="text-[10px] font-medium text-gray-400">More</span>
          </button>
        </div>
      </div>

      {/* more sheet */}
      {sheet && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setSheet(false)}>
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="pb-safe glass-strong absolute inset-x-0 bottom-0 rounded-t-[32px] p-5 shadow-2xl rise-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-900">Menu</p>
              <button onClick={() => setSheet(false)} className="neu-pressable rounded-full bg-white/70 p-1.5">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {more.map((i) => {
                const active = isActive(i.href);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={() => setSheet(false)}
                    className={`neu-pressable flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 ${active ? "bg-gradient-to-b from-teal-600 to-teal-500 text-white" : "bg-white/70 text-gray-600"}`}
                  >
                    <i.icon size={20} />
                    <span className="text-[11px] font-medium leading-tight text-center">{i.label}</span>
                  </Link>
                );
              })}
            </div>
            <p className="mt-4 truncate px-1 text-xs text-gray-400">{email} · {role.replace("_", " ")}</p>
            <div className="mt-2"><LogoutButton /></div>
          </div>
        </div>
      )}
    </>
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
      className="neu-pressable flex w-full items-center justify-center gap-2 rounded-2xl bg-white/70 px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-white/90"
    >
      <LogOut size={16} /> Log out
    </button>
  );
}
