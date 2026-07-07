// ponytail: hand-rolled shadcn-style primitives — one file beats 15 generated ones.
import * as React from "react";

const cx = (...cls: (string | undefined | false)[]) => cls.filter(Boolean).join(" ");

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-xl border border-line bg-white shadow-sm", className)} {...props} />;
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
    default: "bg-primary text-white hover:bg-primary-dark",
    accent: "bg-accent text-gray-900 hover:brightness-95",
    outline: "border border-line bg-white text-gray-700 hover:bg-gray-50",
    ghost: "text-gray-600 hover:bg-gray-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm" };
  return (
    <button
      className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed", variants[variant], sizes[size], className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx("w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx("w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20", className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx("w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx("mb-1 block text-xs font-medium text-gray-600", className)} {...props} />;
}

const BADGE_COLORS: Record<string, string> = {
  // statuses across modules
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  regular: "bg-emerald-50 text-emerald-700 border-emerald-200",
  present: "bg-emerald-50 text-emerald-700 border-emerald-200",
  executed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  hired: "bg-emerald-50 text-emerald-700 border-emerald-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  exported: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  draft: "bg-amber-50 text-amber-700 border-amber-200",
  probationary: "bg-amber-50 text-amber-700 border-amber-200",
  late: "bg-amber-50 text-amber-700 border-amber-200",
  open: "bg-amber-50 text-amber-700 border-amber-200",
  for_approval: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  absent: "bg-red-50 text-red-700 border-red-200",
  terminated: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  archived: "bg-gray-100 text-gray-600 border-gray-200",
  inactive: "bg-gray-100 text-gray-600 border-gray-200",
  resigned: "bg-gray-100 text-gray-600 border-gray-200",
};

export function Badge({ children, status, className }: { children: React.ReactNode; status?: string; className?: string }) {
  const color = (status && BADGE_COLORS[status]) || "bg-blue-50 text-blue-700 border-blue-200";
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", color, className)}>
      {children}
    </span>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className={cx("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cx("bg-muted-bg px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide", className)} {...props} />;
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cx("border-t border-line px-4 py-2.5 text-gray-700", className)} {...props} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line py-12 text-center">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
