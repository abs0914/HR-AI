// ponytail: hand-rolled glass/neumorphic primitives — one file beats 15 generated ones.
import * as React from "react";

const cx = (...cls: (string | undefined | false)[]) => cls.filter(Boolean).join(" ");

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("glass-card rounded-3xl", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("px-5 pt-4 pb-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cx("text-sm font-semibold text-gray-900", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("px-5 pb-4", className)} {...props} />;
}

export function Button({
  className, variant = "default", size = "md", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "danger" | "accent";
  size?: "sm" | "md";
}) {
  const variants = {
    default:
      "text-white bg-gradient-to-b from-teal-600 to-teal-700 shadow-[0_8px_20px_-8px_rgba(15,118,110,0.6)] hover:from-teal-500 hover:to-teal-600",
    accent:
      "text-gray-900 bg-gradient-to-b from-amber-300 to-amber-400 shadow-[0_8px_20px_-8px_rgba(251,191,36,0.6)] hover:brightness-105",
    outline: "glass-strong text-gray-700 hover:bg-white/90",
    ghost: "text-gray-600 hover:bg-black/5",
    danger:
      "text-white bg-gradient-to-b from-red-500 to-red-600 shadow-[0_8px_20px_-8px_rgba(239,68,68,0.6)] hover:from-red-500 hover:to-red-500",
  };
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm" };
  return (
    <button
      className={cx(
        "neu-pressable inline-flex items-center justify-center gap-1.5 rounded-2xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant], sizes[size], className
      )}
      {...props}
    />
  );
}

const fieldBase =
  "w-full rounded-2xl border border-white/70 bg-white/70 px-3.5 py-2.5 text-sm text-gray-900 shadow-inner outline-none transition focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-500/15 placeholder:text-gray-400";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldBase, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(fieldBase, "appearance-none", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx("mb-1.5 block text-xs font-medium text-gray-500", className)} {...props} />;
}

const BADGE_COLORS: Record<string, string> = {
  approved: "bg-emerald-100/70 text-emerald-700",
  regular: "bg-emerald-100/70 text-emerald-700",
  present: "bg-emerald-100/70 text-emerald-700",
  executed: "bg-emerald-100/70 text-emerald-700",
  hired: "bg-emerald-100/70 text-emerald-700",
  active: "bg-emerald-100/70 text-emerald-700",
  done: "bg-emerald-100/70 text-emerald-700",
  exported: "bg-emerald-100/70 text-emerald-700",
  pending: "bg-amber-100/70 text-amber-700",
  draft: "bg-amber-100/70 text-amber-700",
  probationary: "bg-amber-100/70 text-amber-700",
  late: "bg-amber-100/70 text-amber-700",
  open: "bg-amber-100/70 text-amber-700",
  for_approval: "bg-amber-100/70 text-amber-700",
  rejected: "bg-red-100/70 text-red-700",
  absent: "bg-red-100/70 text-red-700",
  terminated: "bg-red-100/70 text-red-700",
  failed: "bg-red-100/70 text-red-700",
  cancelled: "bg-gray-200/70 text-gray-600",
  archived: "bg-gray-200/70 text-gray-600",
  inactive: "bg-gray-200/70 text-gray-600",
  resigned: "bg-gray-200/70 text-gray-600",
};

export function Badge({ children, status, className }: { children: React.ReactNode; status?: string; className?: string }) {
  const color = (status && BADGE_COLORS[status]) || "bg-sky-100/70 text-sky-700";
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", color, className)}>
      {children}
    </span>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="glass-card overflow-x-auto rounded-3xl">
      <table className={cx("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cx("bg-white/40 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide", className)} {...props} />;
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cx("border-t border-white/60 px-4 py-3 text-gray-700", className)} {...props} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-gray-300 bg-white/40 py-12 text-center">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
